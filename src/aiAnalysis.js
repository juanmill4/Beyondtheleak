/**
 * DarkEye AI Analysis
 * Analyzes users to determine if they are identifiable
 * Uses OpenRouter API with z-ai/glm-4.5-air:free model
 */

const OPENROUTER_API_KEY = 'api';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Analyze all users for identifiability using OpenRouter API
 * @param {Array} userNodes - Array of user node data
 * @param {Object} controller - Control object { stopped, killed }
 * @param {Function} onProgress - Callback (processed, total)
 * @param {Function} onUserResult - Callback (userId, identifiable, reasons, evidence)
 * @returns {Promise<{ total: number, processed: number, identifiable: number }>}
 */
export async function analyzeUsers(userNodes, controller, onProgress, onUserResult) {
    const total = userNodes.length;
    let processed = 0;
    let identifiable = 0;

    for (const user of userNodes) {
        if (controller && (controller.stopped || controller.killed)) break;

        try {
            const result = await evaluateUserWithAI(user);
            if (result.identifiable || result.possibleIdentifiable) identifiable++;
            if (onUserResult) {
                onUserResult(user.id, result.identifiable, result.reasons, result.evidence, result.possibleIdentifiable);
            }
        } catch (e) {
            console.warn(`Analysis failed for ${user.id}:`, e.message);
            if (onUserResult) onUserResult(user.id, false, [], [], false);
        }

        processed++;
        if (onProgress) onProgress(processed, total, user.id);

        if (processed < total) await sleep(300);
    }

    return { total, processed, identifiable };
}

/**
 * Analyze a single user for identifiability
 */
export async function analyzeSingleUser(userNode, onResult) {
    try {
        const result = await evaluateUserWithAI(userNode);
        if (onResult) {
            onResult(userNode.id, result.identifiable, result.reasons, result.evidence, result.possibleIdentifiable);
        }
        return result;
    } catch (e) {
        console.warn(`Single analysis failed for ${userNode.id}:`, e.message);
        if (onResult) onResult(userNode.id, false, [], [], false);
        return { identifiable: false, possibleIdentifiable: false, reasons: [], evidence: [] };
    }
}

/**
 * Evaluate a single user — analyze domains from cookies/credentials, then AI
 */
async function evaluateUserWithAI(user) {
    // Analyze domains from Cookie List and Credentials
    const domainAnalysis = analyzeDomains(user);

    // Build data for AI prompt
    const userData = collectUserData(user, domainAnalysis);

    try {
        const prompt = buildPrompt(userData, domainAnalysis);
        const response = await callOpenRouter(prompt);
        return parseAIResponse(response, domainAnalysis);
    } catch (e) {
        console.warn('AI evaluation failed, using domain analysis only:', e.message);
        // Fallback: use domain analysis alone
        return domainAnalysisFallback(domainAnalysis);
    }
}

/**
 * Analyze domains from Cookie List and Credentials URLs
 * Extracts country TLDs and detects social media / crypto / etc.
 */
function analyzeDomains(user) {
    const allDomains = new Set();
    const socialMedia = [];
    const cryptoWallets = [];
    const countryTLDs = {}; // { "es": ["dominio.es", "dominio2.es"] }

    // Social media patterns
    const socialPatterns = ['instagram', 'facebook', 'twitter', 'x.com', 'tiktok', 'linkedin', 'snapchat', 'reddit', 'tumblr', 'pinterest', 'vk.com', 'ok.ru'];
    const cryptoPatterns = ['metamask', 'coinbase', 'binance', 'blockchain', 'crypto', 'ledger', 'trust', 'exodus', 'phantom', 'uniswap'];

    // Known generic TLDs (not country-specific)
    const genericTLDs = new Set(['com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'dev', 'app', 'ai', 'co', 'me', 'info', 'biz', 'pro', 'xyz', 'site', 'online', 'store', 'tech', 'cloud', 'gg', 'tv', 'fm', 'ly']);

    // Process Cookie List domains
    if (user._explorationData?.cookies) {
        for (const domain of user._explorationData.cookies) {
            const clean = domain.trim().toLowerCase();
            if (!clean || clean.length < 3) continue;
            allDomains.add(clean);

            // Check social media
            for (const pattern of socialPatterns) {
                if (clean.includes(pattern)) {
                    socialMedia.push(clean);
                    break;
                }
            }
            // Check crypto
            for (const pattern of cryptoPatterns) {
                if (clean.includes(pattern)) {
                    cryptoWallets.push(clean);
                    break;
                }
            }
            // Check country TLD
            const tld = extractTLD(clean);
            if (tld && tld.length === 2 && !genericTLDs.has(tld)) {
                if (!countryTLDs[tld]) countryTLDs[tld] = [];
                countryTLDs[tld].push(clean);
            }
        }
    }

    // Process Credentials URLs
    if (user._explorationData?.credentials) {
        for (const cred of user._explorationData.credentials) {
            const url = cred.URL || cred.url || '';
            if (!url) continue;

            let hostname;
            try {
                const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
                hostname = urlObj.hostname.toLowerCase();
            } catch (e) {
                const match = url.match(/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/);
                hostname = match ? match[0].toLowerCase() : null;
            }

            if (!hostname) continue;
            allDomains.add(hostname);

            // Check social media
            for (const pattern of socialPatterns) {
                if (hostname.includes(pattern)) {
                    socialMedia.push(`${hostname} (user: ${cred.USER || cred.user || '?'})`);
                    break;
                }
            }
            // Check crypto
            for (const pattern of cryptoPatterns) {
                if (hostname.includes(pattern)) {
                    cryptoWallets.push(`${hostname} (user: ${cred.USER || cred.user || '?'})`);
                    break;
                }
            }
            // Check country TLD
            const tld = extractTLD(hostname);
            if (tld && tld.length === 2 && !genericTLDs.has(tld)) {
                if (!countryTLDs[tld]) countryTLDs[tld] = [];
                if (!countryTLDs[tld].includes(hostname)) {
                    countryTLDs[tld].push(hostname);
                }
            }
        }
    }

    // Find the dominant country TLD
    let maxCountryTLD = null;
    let maxCountryCount = 0;
    for (const [tld, domains] of Object.entries(countryTLDs)) {
        if (domains.length > maxCountryCount) {
            maxCountryCount = domains.length;
            maxCountryTLD = tld;
        }
    }

    return {
        totalDomains: allDomains.size,
        socialMedia: [...new Set(socialMedia)],
        cryptoWallets: [...new Set(cryptoWallets)],
        countryTLDs,
        dominantCountry: maxCountryTLD ? maxCountryTLD.toUpperCase() : null,
        dominantCountryCount: maxCountryCount,
        dominantCountryDomains: maxCountryTLD ? countryTLDs[maxCountryTLD] : [],
    };
}

/**
 * Extract TLD from a hostname
 */
function extractTLD(hostname) {
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    return parts[parts.length - 1].toLowerCase();
}

/**
 * Collect all available user data for the AI prompt
 */
function collectUserData(user, domainAnalysis) {
    const data = {
        email: user.email || 'N/A',
        username: user.username || 'N/A',
        name: user.name || 'N/A',
        phone: user.phone || 'N/A',
    };

    // Email context
    if (user.emailContexts && user.emailContexts.length > 0) {
        data.emailContexts = user.emailContexts.map(ctx => {
            try { return typeof ctx === 'string' ? JSON.parse(ctx) : ctx; }
            catch (e) { return ctx; }
        });
    }

    // Exploration summary
    if (user._explorationData) {
        const ed = user._explorationData;
        data.exploration = {
            cookieDomainsCount: ed.cookies ? ed.cookies.length : 0,
            credentialsCount: ed.credentials ? ed.credentials.length : 0,
            country: ed.country || 'N/A',
            hasFTP: !!ed.ftpInfo,
        };
    }

    // Domain analysis summary
    data.domainAnalysis = {
        socialMedia: domainAnalysis.socialMedia,
        cryptoWallets: domainAnalysis.cryptoWallets,
        dominantCountry: domainAnalysis.dominantCountry,
        dominantCountryCount: domainAnalysis.dominantCountryCount,
        dominantCountryDomains: domainAnalysis.dominantCountryDomains.slice(0, 10),
    };

    return data;
}

/**
 * Build prompt for OpenRouter API
 */
function buildPrompt(userData, domainAnalysis) {
    return `You are analyzing user data from breach/stealer logs for privacy risk assessment. Determine if this user can be personally identified based ONLY on these patterns:

PATTERNS THAT MAKE A USER IDENTIFIABLE (mark as "identifiable"):
1. Has a real phone number (not a placeholder like 000000 or empty) → Identifiable directly
2. Has a real personal name (first + last name, not a username) → Identifiable directly
3. Has social media accounts (Instagram, Facebook, Twitter/X) found in their cookies or credentials → Identifiable directly

PATTERNS THAT MAKE A USER POSSIBLY IDENTIFIABLE (mark as "possibleIdentifiable"):
4. Has date of birth, city, or other PII in their profile data → Possible Identifiable

USER DATA:
${JSON.stringify(userData, null, 2)}

IMPORTANT: Only consider patterns from the list above. Do NOT invent other patterns.

Respond with a JSON object only (no other text):
{
  "identifiable": true/false,
  "possibleIdentifiable": true/false,
  "reasons": ["reason1", "reason2"],
  "evidence": ["specific data point1", "specific data point2"]
}

Rules:
- identifiable=true takes priority over possibleIdentifiable
- If identifiable=true, set possibleIdentifiable=false
- Include the specific data that supports each reason`;
}

/**
 * Call OpenRouter API
 */
async function callOpenRouter(prompt) {
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'DarkEye'
        },
        body: JSON.stringify({
            model: 'z-ai/glm-4.5-air:free',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

/**
 * Parse AI response
 */
function parseAIResponse(response, domainAnalysis) {
    const content = response.trim();

    try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                identifiable: !!parsed.identifiable,
                possibleIdentifiable: !parsed.identifiable && !!parsed.possibleIdentifiable,
                reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
                evidence: Array.isArray(parsed.evidence) ? parsed.evidence : []
            };
        }
    } catch (e) {
        console.warn('[AIAnalysis] Failed to parse JSON response:', e.message);
    }

    // Fallback to domain analysis
    return domainAnalysisFallback(domainAnalysis);
}

/**
 * Fallback when AI is unavailable — use domain analysis only
 */
function domainAnalysisFallback(domainAnalysis) {
    const reasons = [];
    const evidence = [];
    let identifiable = false;
    let possibleIdentifiable = false;

    // Social media → identifiable
    if (domainAnalysis.socialMedia.length > 0) {
        identifiable = true;
        reasons.push('Has social media accounts');
        evidence.push(...domainAnalysis.socialMedia.slice(0, 5));
    }

    // Crypto wallets → possible identifiable
    if (domainAnalysis.cryptoWallets.length > 0) {
        if (!identifiable) possibleIdentifiable = true;
        reasons.push('Has crypto wallet services');
        evidence.push(...domainAnalysis.cryptoWallets.slice(0, 5));
    }

    // Country domains
    if (domainAnalysis.dominantCountryCount >= 3) {
        identifiable = true;
        possibleIdentifiable = false;
        reasons.push(`3+ domains with .${domainAnalysis.dominantCountry.toLowerCase()} TLD`);
        evidence.push(...domainAnalysis.dominantCountryDomains.slice(0, 5));
    } else if (domainAnalysis.dominantCountryCount >= 2) {
        if (!identifiable) {
            // 2 country domains + another pattern = identifiable
            if (possibleIdentifiable) {
                identifiable = true;
                possibleIdentifiable = false;
                reasons.push(`2 domains with .${domainAnalysis.dominantCountry.toLowerCase()} TLD + another pattern`);
            } else {
                possibleIdentifiable = true;
                reasons.push(`2 domains with .${domainAnalysis.dominantCountry.toLowerCase()} TLD`);
            }
        }
        evidence.push(...domainAnalysis.dominantCountryDomains.slice(0, 5));
    }

    return { identifiable, possibleIdentifiable, reasons, evidence };
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
