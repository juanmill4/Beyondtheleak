/**
 * DarkEye Data Processor
 * Transforms API responses into graph-ready node/edge data
 */

/**
 * Process all API data into a structured graph model
 * @param {string} label - The label for the analysis
 * @param {Array} metadata - Breach metadata results
 * @param {Array} fullData - Full breach data results
 * @param {Array} stealerData - Infostealer results
 * @param {Array} searchTerms - Search terms (for multi-domain support)
 * @param {boolean} autoConnectDomains - Whether to auto-connect domain nodes
 * @param {string} searchField - The field that triggered the search (domain, username, etc.)
 * @returns {{ nodes: Array, edges: Array, services: Map, users: Map, domains: Map }}
 */
export function processData(label, metadata, fullData, stealerData, searchTerms = [], autoConnectDomains = false, searchField = 'domain') {
    const services = new Map();   // hostname -> service info
    const users = new Map();      // uniqueKey -> user info
    const domains = new Map();    // domain -> domain node info
    const externalDomains = new Map(); // external domains that users access
    const edges = [];
    const isMultiDomainSearch = searchTerms.length > 1;
    const primaryDomain = searchTerms[0] || 'unknown';

    // Helper to extract hostname from a URL
    function extractHostname(url) {
        if (!url) return null;
        try {
            const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
            return urlObj.hostname;
        } catch (e) {
            // If URL parsing fails, try to extract domain manually
            const match = url.match(/^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/);
            return match ? match[0] : null;
        }
    }

    // Helper to check if a hostname is linked to a specific domain
    function isLinkedToDomain(hostname, mainDomain) {
        if (!hostname || !mainDomain) return false;
        const lowerHostname = hostname.toLowerCase();
        const lowerDomain = mainDomain.toLowerCase();

        // Exact match
        if (lowerHostname === lowerDomain) return true;

        // www subdomain
        if (lowerHostname === `www.${lowerDomain}`) return true;

        // Any subdomain of the main domain (hostname ends with .maindomain.com)
        if (lowerHostname.endsWith(`.${lowerDomain}`)) return true;

        // Contains the domain (e.g., subdomain.maindomain.com)
        if (lowerHostname.includes(lowerDomain)) return true;

        return false;
    }

    const isHubSearch = searchField === 'username' || searchField === 'email';
    // Remove the legacy single hubNodeId

    // Helper to determine which domain a hostname belongs to
    function getDomainForHostname(hostname) {
        if (!hostname || isHubSearch) return null;

        // For multi-domain searches, check which domain this hostname belongs to
        for (const domain of searchTerms) {
            if (isLinkedToDomain(hostname, domain)) {
                return domain;
            }
        }

        // If no match found, return null — this is an external service
        return null;
    }

    // --- Ensure domain nodes exist for all search terms ---
    if (!isHubSearch) {
        for (const term of searchTerms) {
            if (!domains.has(term)) {
                domains.set(term, {
                    id: `domain_${term.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    type: 'domain',
                    label: term,
                    hostname: null,
                    isPrimary: term === primaryDomain,
                });
            }
        }
    }

    // --- Process full breach data ---
    console.log('[Processor] Processing breach data...');
    for (const record of fullData) {
        const data = record.data || record.full_data || record;
        // Handle nested full_data.full_data structure from fulldata/domain API
        const innerData = data.full_data || data;
        const email = (innerData.email || data.email || '').toLowerCase();
        const username = innerData.username || data.username || '';
        const name = innerData.name || data.name || '';
        const emailContext = innerData.email_context || data.email_context || '';

        // Extract new data structure elements for fulldata
        const url = innerData.url || data.url || innerData.URL || data.URL || '';
        const userField = innerData.user || data.user || innerData.USER || data.USER || '';
        const password = innerData.pas || data.pas || innerData.pass || data.pass || innerData.password || data.password || '';

        // Extract hostname from domain or url
        let hostname = innerData.domain || data.domain || '';
        if (!hostname && url) hostname = extractHostname(url);
        if (!hostname && !isHubSearch) hostname = searchTerms[0] || 'unknown';
        else if (!hostname && isHubSearch) hostname = 'unknown';


        // Determine which domain this belongs to (null = external)
        const domainForHostname = getDomainForHostname(hostname);

        // Ensure domain node exists (only for matched domains)
        if (domainForHostname && !domains.has(domainForHostname)) {
            domains.set(domainForHostname, {
                id: `domain_${domainForHostname.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'domain',
                label: domainForHostname,
                hostname: null,
                isPrimary: domainForHostname === primaryDomain,
            });
        }

        // Create service if it doesn't exist
        if (!services.has(hostname)) {
            const isLinked = domainForHostname ? isLinkedToDomain(hostname, domainForHostname) : false;
            services.set(hostname, {
                id: `svc_${hostname.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'service',
                label: hostname,
                hostname: hostname,
                sourceType: 'breach',
                credentialsFound: 0,
                usersCount: 0,
                sources: new Set(),
                isLinkedToDomain: isLinked,
                mainDomain: domainForHostname,
                linkedDomainId: domainForHostname ? `domain_${domainForHostname.replace(/[^a-zA-Z0-9]/g, '_')}` : null,
            });

            console.log(`[Processor] Created service ${hostname} linked to ${domainForHostname}: ${isLinked}`);
        } else {
            // Update existing service
            const service = services.get(hostname);
            const sourceId = data.id_source || record.source_metadata?.id || 'unknown';
            service.sources.add(sourceId);
        }

        // Create user key
        const userKey = email || userField || username || name || record.search_term || (searchField === 'email' ? searchTerms[0] : `anon_breach_${Math.random().toString(36).slice(2, 8)}`);


        // Create or update user
        if (!users.has(userKey)) {
            users.set(userKey, {
                id: `usr_${userKey.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'user',
                email: email || (searchField === 'email' ? (record.search_term || searchTerms[0]) : ''),
                username: username,
                name: name || extractNameFromContext(emailContext),
                phone: extractField(emailContext, 'phone'),
                emailContexts: [],
                label: email || userField || username || (searchField === 'email' ? (record.search_term || searchTerms[0]) : name) || 'Anonymous',
                isOrgEmail: searchTerms.some(term => email?.toLowerCase().endsWith(`@${term.toLowerCase()}`)),
                services: new Set(),
                deleted: false,
                identifiable: null,
                rawData: [],
                hwids: [], // Will be populated if this user also appears in stealer data
                searchTermIds: [],
                dataSource: 'breach',
            });
        }

        const user = users.get(userKey);
        user.services.add(hostname);
        user.rawData.push({
            ...data,
            source_metadata: record.source_metadata || data.source_metadata,
            hostname: hostname
        });

        // Persist search_term identifier for later explore/AI analysis and mapping
        if (record.search_term && !user.searchTermIds.includes(record.search_term)) {
            user.searchTermIds.push(record.search_term);
        }

        // Accumulate email_context for this user (concatenate if multiple records)
        if (emailContext) {
            user.emailContexts = user.emailContexts || [];
            user.emailContexts.push(emailContext);
        }

        // Add fulldata credentials to user exploration data
        if (url || password || userField) {
            user._explorationData = user._explorationData || { cookies: [], credentials: [], allHwids: [], rawRecords: [] };
            user._explorationData.credentials = user._explorationData.credentials || [];

            let urlExists = false;
            // The logic: URL shouldn't be duplicate in credentials.
            // Some URLs might be the same.
            if (url) {
                urlExists = user._explorationData.credentials.some(c => c.URL === url || c.url === url);
            }

            if (!urlExists || !url) {
                user._explorationData.credentials.push({
                    URL: url,
                    USER: userField || email || username,
                    PASS: password || ''
                });
                user.credentialsFound = (user.credentialsFound || 0) + 1;
            }
        }
    }


    // --- Process stealer data ---
    console.log('[Processor] Processing stealer data...');
    console.log(`[Processor] Stealer records: ${stealerData.length}`);

    for (const record of stealerData) {
        // Handle different possible field names
        const url = record.URL || record.url || '';
        const email = (record.email || record.USER || record.user || record.username || '').toLowerCase();
        const username = record.USER || record.user || record.username || '';
        const password = record.PASS || record.password || '';
        const filename = record.Filename || record.filename || record.Doc || record.doc || '';

        // Extract hostname from URL
        const hostname = extractHostname(url);

        // Skip if we couldn't extract a hostname
        if (!hostname) {
            console.warn('[Processor] Skipping record without valid hostname:', url);
            continue;
        }

        // Determine which domain this hostname belongs to (null = external)
        const domainForHostname = getDomainForHostname(hostname);

        // Ensure domain node exists (only for matched domains)
        if (domainForHostname && !domains.has(domainForHostname)) {
            domains.set(domainForHostname, {
                id: `domain_${domainForHostname.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'domain',
                label: domainForHostname,
                hostname: null,
                isPrimary: domainForHostname === primaryDomain,
            });
        }

        // Create service if it doesn't exist
        if (!services.has(hostname)) {
            const isLinked = domainForHostname ? isLinkedToDomain(hostname, domainForHostname) : false;
            services.set(hostname, {
                id: `svc_${hostname.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'service',
                label: hostname,
                hostname: hostname,
                sourceType: 'stealer',
                credentialsFound: 0,
                usersCount: 0,
                sources: new Set(),
                isLinkedToDomain: isLinked,
                mainDomain: domainForHostname,
                linkedDomainId: domainForHostname ? `domain_${domainForHostname.replace(/[^a-zA-Z0-9]/g, '_')}` : null,
            });

            console.log(`[Processor] Created service ${hostname} linked to ${domainForHostname}: ${isLinked}`);
        }

        const service = services.get(hostname);
        service.sourceType = 'stealer'; // Mark as having stealer data
        service.credentialsFound++;

        // Create user key - prioritize email, then username
        const userKey = email || username || record.search_term || (searchField === 'email' ? searchTerms[0] : `anon_stealer_${Math.random().toString(36).slice(2, 8)}`);

        // Create or update user
        if (!users.has(userKey)) {
            users.set(userKey, {
                id: `usr_${userKey.replace(/[^a-zA-Z0-9]/g, '_')}`,
                type: 'user',
                email: email || (searchField === 'email' ? (record.search_term || searchTerms[0]) : ''),
                username: username,
                name: '',
                phone: '',
                label: email || username || (searchField === 'email' ? (record.search_term || searchTerms[0]) : 'Anonymous'),
                isOrgEmail: searchTerms.some(term => email?.toLowerCase().endsWith(`@${term.toLowerCase()}`)),
                services: new Set(),
                deleted: false,
                identifiable: null,
                rawData: [],
                hwids: [], // Array of {hwid, filename} objects extracted from Filename field
                searchTermIds: [], // Stores search_term identifiers from fullstealer API
                dataSource: 'stealer',
            });
        }

        // Extract and store HWID from Filename field
        if (filename) {
            const user = users.get(userKey);
            const hwidMatch = filename.match(/HWID\s+([A-Fa-f0-9]+)/i);
            const hwidValue = hwidMatch ? hwidMatch[1] : null;
            const alreadyHas = user.hwids.some(h => h.filename === filename);
            if (!alreadyHas) {
                user.hwids.push({ hwid: hwidValue, filename: filename });
            }
        }

        const user = users.get(userKey);
        user.services.add(hostname);
        user.rawData.push({
            ...record,
            hostname: hostname,
            url: url,
            password: password
        });

        // Persist search_term identifier for later explore/AI analysis
        if (record.search_term && !user.searchTermIds.includes(record.search_term)) {
            user.searchTermIds.push(record.search_term);
        }

        // Store password if available
        if (password) user.hasPassword = true;
    }

    console.log(`[Processor] Total unique hostnames: ${services.size}`);
    console.log(`[Processor] Total unique users: ${users.size}`);
    console.log(`[Processor] Total domains: ${domains.size}`);

    // --- Build nodes array ---
    const nodes = [];

    // If searching by username or email, create a central Hub node for each term
    const hubIds = [];
    if (isHubSearch) {
        for (const term of searchTerms) {
            const hId = `hub_${term.replace(/[^a-zA-Z0-9]/g, '_')}`;
            hubIds.push(hId);
            nodes.push({
                id: hId,
                type: 'domain', // Render as a blue hexagon root
                label: term,
                hostname: null,
                isPrimary: term === primaryDomain,
                isHub: true
            });
        }
    }

    // Add all domain nodes
    for (const [domainName, domainNode] of domains) {
        nodes.push(domainNode);
    }

    // Service nodes + edges from their respective domains
    for (const [hostname, svc] of services) {
        svc.usersCount = 0; // Will count when processing users

        // Skip if this hostname is the same as a main domain
        const linkedDomainId = svc.linkedDomainId;
        if (linkedDomainId && hostname === svc.mainDomain) {
            // This is the main domain, skip duplicate
            console.log(`[Processor] Skipping duplicate service node for main domain: ${hostname}`);
            continue;
        }

        // Add service node
        nodes.push(svc);

        // Only connect to its linked domain if it's a subdomain
        // External domains (google.com, etc.) should NOT be connected to the main domain node
        if (svc.isLinkedToDomain && linkedDomainId) {
            edges.push({
                from: linkedDomainId,
                to: svc.id,
                type: 'domain-service',
            });
        }
    }

    // User nodes + edges from services
    for (const [, user] of users) {
        // Convert Set to Array for serialization
        user.serviceIds = Array.from(user.services);
        nodes.push(user);

        // Track which domains this user is connected to
        const connectedDomains = new Set();

        // Count users per service and create edges
        for (const hostname of user.services) {
            const svc = services.get(hostname);
            if (svc) svc.usersCount++;

            // Determine which domain this service belongs to
            const linkedDomainId = svc ? svc.linkedDomainId : null;

            // Check if this is a main domain (or www subdomain)
            if (linkedDomainId && hostname === svc.mainDomain) {
                // Connect directly to domain node, skip service node
                edges.push({
                    from: linkedDomainId,
                    to: user.id,
                    type: 'direct-org-user',
                });
                connectedDomains.add(linkedDomainId);
            } else if (linkedDomainId && svc.isLinkedToDomain) {
                // This is a subdomain of a primary domain — connect service to user
                const serviceId = svc.id;
                edges.push({
                    from: serviceId,
                    to: user.id,
                    type: 'service-user',
                });
            } else {
                // External service (not linked to any primary domain)
                // Connect user to the service node
                const serviceId = `svc_${hostname.replace(/[^a-zA-Z0-9]/g, '_')}`;
                const serviceExists = nodes.find(n => n.id === serviceId);
                if (serviceExists) {
                    edges.push({
                        from: serviceId,
                        to: user.id,
                        type: 'service-user',
                    });
                }

                // If user is an org employee, also connect user to their org domain
                if (user.isOrgEmail && !isHubSearch) {
                    const orgDomain = searchTerms.find(term => user.email?.toLowerCase().endsWith(`@${term.toLowerCase()}`));
                    if (orgDomain) {
                        const orgDomainId = `domain_${orgDomain.replace(/[^a-zA-Z0-9]/g, '_')}`;

                        // Check if this connection already exists
                        const connectionExists = edges.some(e =>
                            e.from === orgDomainId && e.to === user.id
                        );

                        if (!connectionExists) {
                            edges.push({
                                from: orgDomainId,
                                to: user.id,
                                type: 'domain-user',
                            });
                            connectedDomains.add(orgDomainId);
                        }
                    }
                }
            }
        }

        // If user is org but has NO connections at all, connect to their org domain
        if (user.isOrgEmail && connectedDomains.size === 0 && !isHubSearch) {
            const orgDomain = searchTerms.find(term => user.email?.toLowerCase().endsWith(`@${term.toLowerCase()}`));
            if (orgDomain) {
                const orgDomainId = `domain_${orgDomain.replace(/[^a-zA-Z0-9]/g, '_')}`;
                edges.push({
                    from: orgDomainId,
                    to: user.id,
                    type: 'direct-org-user',
                });
            }
        }

        // If searching by username or email, bind the user strictly to the corresponding hub
        if (isHubSearch) {
            let matchedTerm = searchTerms.find(t => {
                const searchLower = t.toLowerCase();
                const emLower = (user.email || '').toLowerCase();
                const unLower = (user.username || '').toLowerCase();
                return emLower === searchLower || unLower === searchLower;
            });
            // Fallback to explicitly recorded term identifiers
            if (!matchedTerm) matchedTerm = (user.searchTermIds && user.searchTermIds.length > 0) ? user.searchTermIds[0] : searchTerms[0];

            const matchingHubId = `hub_${matchedTerm.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const connectionExists = edges.some(e => e.from === matchingHubId && e.to === user.id);
            if (!connectionExists) {
                edges.push({
                    from: matchingHubId,
                    to: user.id,
                    type: 'direct-org-user' // Ensures it draws a direct thick line in UI
                });
            }
        }
    }

    // Auto-connect domains (or hubs) if requested
    if (autoConnectDomains) {
        if (isHubSearch && hubIds.length > 1) {
            console.log(`[Processor] Auto-connecting ${hubIds.length} hubs`);
            for (let i = 0; i < hubIds.length; i++) {
                for (let j = i + 1; j < hubIds.length; j++) {
                    const fromId = hubIds[i];
                    const toId = hubIds[j];
                    const connectionExists = edges.some(e =>
                        e.type === 'domain-domain' &&
                        ((e.from === fromId && e.to === toId) ||
                            (e.from === toId && e.to === fromId))
                    );

                    if (!connectionExists) {
                        edges.push({
                            from: fromId,
                            to: toId,
                            type: 'domain-domain',
                            dashes: [5, 5],
                        });
                    }
                }
            }
        } else if (!isHubSearch && domains.size > 1) {
            const domainNodes = Array.from(domains.values());
            console.log(`[Processor] Auto-connecting ${domainNodes.length} domains`);

            for (let i = 0; i < domainNodes.length; i++) {
                for (let j = i + 1; j < domainNodes.length; j++) {
                    const fromId = domainNodes[i].id;
                    const toId = domainNodes[j].id;
                    const connectionExists = edges.some(e =>
                        e.type === 'domain-domain' &&
                        ((e.from === fromId && e.to === toId) ||
                            (e.from === toId && e.to === fromId))
                    );

                    if (!connectionExists) {
                        edges.push({
                            from: fromId,
                            to: toId,
                            type: 'domain-domain',
                            dashes: [5, 5],
                        });
                    }
                }
            }
        }
    }

    console.log(`[Processor] Final graph - Nodes: ${nodes.length}, Edges: ${edges.length}`);

    return { nodes, edges, services, users, domains };
}

function extractNameFromContext(context) {
    if (!context) return '';
    // Try to pull a name-like string from email_context
    const nameMatch = context.match(/(?:name|nombre|Name)[\s:=]+([A-Za-zÁ-ú\s]+)/i);
    return nameMatch ? nameMatch[1].trim().slice(0, 50) : '';
}

function extractField(context, field) {
    if (!context) return '';
    const regex = new RegExp(`(?:${field})[\\s:=]+([^,;\\n]+)`, 'i');
    const match = context.match(regex);
    return match ? match[1].trim() : '';
}
/**
 * Extract structured user data from an array of email_context strings
 * using robust regex patterns refined across 5 batches of real data.
 * Contexts are lowercased before matching to simplify regex patterns.
 * Keys that end with ':' inside quotes (e.g. "Name:") are handled via :? after \b.
 * @param {string[]} contexts - Array of email_context strings
 * @returns {Object} Extracted user data fields (each is a unique array)
 */
export function extractUserDataFromContexts(contexts) {
    if (!contexts || contexts.length === 0) return null;

    // All key alternatives are lowercase since we lowercase the context before matching
    // :? after \b handles keys like "Name:" where colon is part of the key name
    const patterns = {
        names: [
            /(?:["']?\b(?:name|nombre|a_name(?:_normal)?|full_name|nombre_completo|fullname|nombrecompleto|nome_cliente|display_name|welloperator|customername|first_name|last_name|per_first|per_father|per_grand|firstname|lastname|pib)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g,
            /(?:["']?\b(?:personfirstname|first_name|first name|employee first name|firstname)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)).*?["']?\b(?:personlastname|last_name|last name|employee last name|lastname)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g,
            /(?:["']?\b(?:surname|last_name)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)).*?["']?\b(?:name|first_name)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g,
            /(?:["']?\b(?:name|first_name)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)).*?["']?\b(?:surname|last_name)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        phones: [
            /(?:["']?\b(?:phone(?:_number| number|1|2)?|a_phone|b_phone|tel|telephone|telefono|teléfono|contact|telephone_number|mobile_phone|telefono_movil|telefono_fijo|cel_contato|fixo_contato|telefone|business phone|home phone number|phone1|phone2|supplier_phone)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        zipcodes: [
            /(?:["']?\b(?:zipcode|zip|postal_code|a_postcode|b_postcode|postcode|codigo_postal|location_postal_code|cep|zip code|zip or postal code)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        countries: [
            /(?:["']?\b(?:country|a_country|b_country|location_country|pais|país|countyname|citizenship)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        usernames: [
            /(?:["']?\b(?:username|user_name|linkedin_username|nombre_usuario|facebook_username|alias)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        jobs: [
            /(?:["']?\b(?:job title|job description|title|position|job_title|a_job_title|dept description|personoccupation|puesto|cargo)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        companies: [
            /(?:["']?\b(?:company|company_name|job_company_name|empresa|supplier_name|home institution)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        addresses: [
            /(?:["']?\b(?:address(?:1|2)?|street|street_address|b_street_address|primaryaddress|direccion|a_street_address|location_street_address|endereco|compl_endereco|address 1|address line 1)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        genders: [
            /(?:["']?\b(?:gender|persongender|sexo|genero)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        birthdates: [
            /(?:["']?\b(?:dateofbirth|birth_date|dob|bday|persondateofbirthyear|birthday|fecha_nacimiento|per_dob)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ],
        languages: [
            /(?:["']?\b(?:language|idioma)\b:?["']?\s*[:=]\s*(?:["']([^"'\n]+)["']|([^,\n}]+)))/g
        ]
    };

    // Email regex: match email addresses between quotes, commas, semicolons, or colons
    const emailRegex = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/g;

    function hasNumber(str) { return /\d/.test(str); }
    function isValidPhone(phone) {
        const digits = phone.replace(/\D/g, '');
        return /^[\+\d\s\-\(\)]+$/.test(phone) && digits.length >= 5 && digits.length <= 15;
    }
    function titleCase(str) {
        return str.replace(/\b\w+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
    }

    const result = {};
    for (const key in patterns) result[key] = [];
    result.emails = [];

    for (const rawCtx of contexts) {
        if (!rawCtx) continue;
        // Lowercase the context so all regex keys only need lowercase alternatives
        const ctx = rawCtx.toLowerCase();

        // Extract emails from the raw context
        let emailMatch;
        emailRegex.lastIndex = 0;
        while ((emailMatch = emailRegex.exec(ctx)) !== null) {
            result.emails.push(emailMatch[0].trim());
        }

        for (const key in patterns) {
            patterns[key].forEach(regex => {
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(ctx)) !== null) {
                    if (key === 'names') {
                        if (match.length > 3 && (match[1] || match[2]) && (match[3] || match[4])) {
                            let first = (match[1] || match[2]).trim();
                            let last = (match[3] || match[4]).trim();
                            result[key].push((first + ' ' + last).trim());
                        } else {
                            let val = match[1] || match[2];
                            if (val) result[key].push(val.trim());
                        }
                    } else {
                        let val = match[1] || match[2];
                        if (val) result[key].push(val.trim());
                    }
                }
            });
        }
    }

    // Filter and deduplicate
    for (const key in result) {
        result[key] = result[key].filter(m => {
            m = m.replace(/^["']+|["']+$/g, '').trim();
            const l = m.toLowerCase();
            if (l === 'none' || l === 'null' || l === '' || l === '0' || l === '0000' || l === '\\n') return false;
            if (m.includes('{') || m.includes('}')) return false;
            if (key === 'names') {
                if (hasNumber(m)) return false;
                if (m.includes('\\u') || m.includes('\\\\u')) return false;
            }
            if (key === 'phones') return isValidPhone(m);
            if (key === 'genders') return (l === 'm' || l === 'f' || l === 'male' || l === 'female');
            return true;
        });
        result[key] = [...new Set(result[key])];
    }

    // Apply Title Case formatting to specific fields
    const titleCaseFields = ['names', 'countries', 'jobs', 'companies', 'addresses', 'genders', 'languages'];
    for (const field of titleCaseFields) {
        if (result[field]) {
            result[field] = result[field].map(v => titleCase(v));
        }
    }

    // Return null if nothing was extracted
    const hasData = Object.values(result).some(arr => arr.length > 0);
    return hasData ? result : null;
}


