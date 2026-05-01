/**
 * DarkEye - Domain Analysis
 * Main Application Entry Point
 */
import './style.css';
import { searchMetadata, searchFullData, searchFullStealer, searchFullStealerEmployees, searchFullStealerByField, searchFullDataByField, searchFullStealerFilename, investigate, checkInvestigationStatus, detectCryptoNetwork, fetchEVMBalance, fetchEVMTransactions, fetchBTCBalance, fetchBTCTransactions, fetchXPUBBalance, fetchXPUBTransactions, searchWalletUsers } from './api.js';
import { processData, extractUserDataFromContexts } from './dataProcessor.js';
import { GraphManager } from './graph.js';
import { FiltersManager } from './filters.js';
import { analyzeUsers, analyzeSingleUser } from './aiAnalysis.js';

// ===== Auth Guard =====
const BACKEND_URL = window.location.origin;
const darkeyeToken = localStorage.getItem('darkeye_token');
const darkeyeUser = JSON.parse(localStorage.getItem('darkeye_user') || 'null');
if (!darkeyeToken) {
  window.location.href = '/login.html';
}

// ===== Project State =====
let currentProjectId = null;
let currentProjectName = null;

// ===== State =====
let currentSearchField = 'domain';
let currentSearchTerms = [];
let graphManager = null;
let filtersManager = null;
let isAnalyzing = false;
let searchController = null; // Controller for stopping API calls
let aiRunning = false;
let autoConnectDomains = false; // Auto-connect domains flag (unchecked by default)
let usersExplored = false; // Whether exploration has been done
let usersPreidentified = false; // Whether preidentification has run
let explorationVisible = true;
let isExploring = false;
let exploreController = null;
let currentSearchLimit = null; // null (all), 60, 150, 300, or 600

// OSINT Blacklists
const USERNAME_BLACKLIST = (() => {
  const baseWords = [
    'root', 'admin', 'administrator', 'guest', 'wifi', 'user', 'test',
    'hadoop', 'deploy', 'ubuntu', 'postgres', 'oracle', 'ftpuser', 'password',
    'default', 'centos', 'support', 'phpadmin', 'linux', 'company', 'contact',
    'manager', 'marketing', 'office', 'personal', 'sales', 'testing'
  ];
  const suffixes = ['', '1', '12', '123', '1234', '@', '#', '$'];
  const blacklist = new Set();
  baseWords.forEach(base => {
    suffixes.forEach(suffix => {
      blacklist.add(base + suffix);
    });
  });
  return blacklist;
})();
const EMAIL_DOMAIN_BLACKLIST = new Set([
  'kaoing.com', 'yzcalo.com', 'yopmail.com', 'mailto.plus', 'fexpost.com',
  'fexbox.org', 'mailbox.in.ua', 'rover.info', 'chitthi.in', 'fextemp.com',
  'any.pink', 'merepost.com', 'mediaholy.com', 'necub.com', 'dollicons.com',
  'test.com'
]);

// ===== DOM Elements =====
const searchField = document.getElementById('search-field');
const searchInput = document.getElementById('search-input');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const dataSourceSelector = document.getElementById('data-source-selector');
const analyzeBtn = document.getElementById('analyze-btn');
const stopAnalysisBtn = document.getElementById('stop-analysis-btn');
const killSearchBtn = document.getElementById('kill-search-btn');
const cleanBtn = document.getElementById('clean-btn');
const autoConnectDomainsCheckbox = document.getElementById('auto-connect-domains');
const loadLimitSelector = document.getElementById('load-limit-selector');
const btnLoadNext = document.getElementById('btn-load-next');
const multiDomainOptions = document.getElementById('multi-domain-options');
const headerStats = document.getElementById('header-stats');
const statServices = document.getElementById('stat-services');
const statUsers = document.getElementById('stat-users');
const statConnections = document.getElementById('stat-connections');
const graphPlaceholder = document.getElementById('graph-placeholder');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

// Node actions
const nodeActionsSection = document.getElementById('node-actions-section');
const nodeInfoPanel = document.getElementById('node-info-panel');
const btnDeleteNode = document.getElementById('btn-delete-node');
const btnConnectUsers = document.getElementById('btn-connect-users');
const btnConnectDomains = document.getElementById('btn-connect-domains');

// AI Analysis
const btnAnalyzeUsers = document.getElementById('btn-analyze-users');
const btnStopAnalysis = document.getElementById('btn-stop-analysis');
const btnKillAnalysis = document.getElementById('btn-kill-analysis');
const aiControls = document.getElementById('ai-controls');

// Explore Data UI
const btnStopExplore = document.getElementById('btn-stop-explore');
const btnKillExplore = document.getElementById('btn-kill-explore');
const exploreControls = document.getElementById('explore-controls');
const aiProgressContainer = document.getElementById('ai-progress-container');
const aiProgressBar = document.getElementById('ai-progress-bar');
const aiProgressLabel = document.getElementById('ai-progress-label');
const aiProgressCount = document.getElementById('ai-progress-count');

// Explore / Preidentify
const btnExploreUsers = document.getElementById('btn-explore-users');
const btnPreidentifyUsers = document.getElementById('btn-preidentify-users');
const btnAmplifyUsers = document.getElementById('btn-amplify-users');
const btnShowAllUsersData = document.getElementById('btn-show-all-users-data');
const showAllDataControls = document.getElementById('show-all-data-controls');
const btnStopShowAllData = document.getElementById('btn-stop-show-all-data');
let showAllDataController = null;
const btnToggleExploration = document.getElementById('btn-toggle-exploration');
const toggleExplorationLabel = document.getElementById('toggle-exploration-label');
const exploreProgressContainer = document.getElementById('explore-progress-container');
const exploreProgressBar = document.getElementById('explore-progress-bar');
const exploreProgressLabel = document.getElementById('explore-progress-label');
const exploreProgressCount = document.getElementById('explore-progress-count');

// Context menu
const contextMenu = document.getElementById('context-menu');
const ctxExploreUser = document.getElementById('ctx-explore-user');
const ctxAnalyzeUser = document.getElementById('ctx-analyze-user');
const ctxAmplifySuperuser = document.getElementById('ctx-amplify-superuser');
const ctxAutopivotEmails = document.getElementById('ctx-autopivot-emails');
const ctxAutopivotPhones = document.getElementById('ctx-autopivot-phones');
const ctxShowUserData = document.getElementById('ctx-show-user-data');
const ctxExploreIdentify = document.getElementById('ctx-explore-identify');
const ctxShowSupernode = document.getElementById('ctx-show-supernode');
const ctxShowSocial = document.getElementById('ctx-show-social');
const ctxShowAllSocial = document.getElementById('ctx-show-all-social');
const ctxDeleteEdge = document.getElementById('ctx-delete-edge');
const btnShowTopSocial = document.getElementById('btn-show-top-social');
const imageModal = document.getElementById('image-modal');
const imageModalImg = document.getElementById('image-modal-img');
const imageModalClose = document.getElementById('image-modal-close');
const ctxDeleteDomain = document.getElementById('ctx-delete-domain');
const ctxDeleteDomainCascading = document.getElementById('ctx-delete-domain-cascading');
const ctxRemoveGroup = document.getElementById('ctx-remove-group');
const ctxCopyGroup = document.getElementById('ctx-copy-group');
const ctxDeleteNodeAction = document.getElementById('ctx-delete-node-action');
const ctxConnectNodeAction = document.getElementById('ctx-connect-node-action');
const ctxExploreTransactions = document.getElementById('ctx-explore-transactions');

let contextMenuTargetNode = null;
let contextMenuTargetEdge = null;

// Node modal
const nodeModal = document.getElementById('node-modal');
const nodeModalTitle = document.getElementById('node-modal-title');
const nodeModalBody = document.getElementById('node-modal-body');
const nodeModalClose = document.getElementById('node-modal-close');
const nodeModalActionBtn = document.getElementById('node-modal-action-btn');

nodeModalClose.addEventListener('click', () => {
  nodeModal.style.display = 'none';
});

// Floating analysis status
const floatingAnalysisStatus = document.getElementById('floating-analysis-status');
const floatingAnalysisText = document.getElementById('floating-analysis-text');

// Search Append Modal
const searchAppendModal = document.getElementById('search-append-modal');
const btnSearchClear = document.getElementById('btn-search-clear');
const btnSearchAppend = document.getElementById('btn-search-append');

// Subdomain discovery
const btnSubdomains = document.getElementById('btn-subdomains');

// Country filter
const filterCountry = document.getElementById('filter-country');

// Physics Settings
const physicsBtn = document.getElementById('physics-settings-btn');
const physicsMenu = document.getElementById('physics-settings-menu');

// ===== Init =====
function init() {
  document.body.classList.add('app-ready');
  graphManager = new GraphManager('graph-canvas');
  graphManager.init();
  graphManager.onNodeSelect = handleNodeSelect;
  graphManager.onNodeDeselect = handleNodeDeselect;
  graphManager.onNodeContextMenu = handleNodeContextMenu;
  graphManager.onEdgeContextMenu = handleEdgeContextMenu;
  graphManager.onNodeDoubleClick = handleNodeDoubleClick;

  filtersManager = new FiltersManager();
  filtersManager.onChange = handleFiltersChange;

  // Read saved Physics Configuration
  const savedPhysics = localStorage.getItem('visPhysicsConfig') || 'fast';
  if (savedPhysics) {
    graphManager.setPhysics(savedPhysics);
    // Visual tracker logic
    document.querySelectorAll('#physics-settings-menu .physics-item').forEach(el => {
      el.classList.toggle('active', el.dataset.physics === savedPhysics);
    });
  }

  // Load saved mode config
  const savedMode = localStorage.getItem('visModeConfig') || 'centralized';
  if (savedMode) {
    graphManager.setMode(savedMode);
    document.querySelectorAll('#physics-settings-menu .mode-item').forEach(el => {
      el.classList.toggle('active', el.dataset.mode === savedMode);
    });
  } else {
    graphManager.setMode('centralized');
    document.querySelector('#physics-settings-menu .mode-item[data-mode="centralized"]')?.classList.add('active');
  }

  // Event listeners
  analyzeBtn.addEventListener('click', handleAnalyzeSearch);
  stopAnalysisBtn.addEventListener('click', handleStopSearchAnalysis);
  killSearchBtn.addEventListener('click', handleKillSearchAnalysis);
  cleanBtn.addEventListener('click', () => {
    // Check if there are nodes in the graph
    const hasNodes = graphManager && graphManager.allNodesData && graphManager.allNodesData.length > 0;
    if (hasNodes) {
      // Show save-before-clear modal
      const modal = document.getElementById('save-before-clear-modal');
      if (modal) modal.style.display = 'flex';
    } else {
      handleCleanEverything();
    }
  });

  // Save-before-clear modal buttons
  const clearCancelBtn = document.getElementById('clear-cancel');
  const clearDontSaveBtn = document.getElementById('clear-dont-save');
  const clearSaveBtn = document.getElementById('clear-save');

  if (clearCancelBtn) clearCancelBtn.addEventListener('click', () => {
    document.getElementById('save-before-clear-modal').style.display = 'none';
  });
  if (clearDontSaveBtn) clearDontSaveBtn.addEventListener('click', () => {
    document.getElementById('save-before-clear-modal').style.display = 'none';
    handleCleanEverything();
  });
  if (clearSaveBtn) clearSaveBtn.addEventListener('click', () => {
    document.getElementById('save-before-clear-modal').style.display = 'none';
    openSaveProjectModal(() => handleCleanEverything());
  });

  // ===== User Menu =====
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userMenuDropdown = document.getElementById('user-menu-dropdown');
  const userMenuName = document.getElementById('user-menu-name');

  if (darkeyeUser && userMenuName) {
    userMenuName.textContent = darkeyeUser.display_name || darkeyeUser.username || 'User';
  }

  if (userMenuBtn) {
    userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuDropdown.style.display = userMenuDropdown.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => { if (userMenuDropdown) userMenuDropdown.style.display = 'none'; });
  }

  function navigateWithSaveGuard(targetUrl) {
    const hasNodes = graphManager && graphManager.allNodesData && graphManager.allNodesData.length > 0;
    if (hasNodes) {
      // Temporarily override the modal buttons for navigation
      const modal = document.getElementById('save-before-clear-modal');
      const msg = modal.querySelector('p');
      const originalMsg = msg.textContent;
      msg.textContent = 'Do you want to save the current project before leaving?';
      modal.style.display = 'flex';
      
      const newDontSave = clearDontSaveBtn.cloneNode(true);
      const newSave = clearSaveBtn.cloneNode(true);
      const newCancel = clearCancelBtn.cloneNode(true);
      
      clearDontSaveBtn.replaceWith(newDontSave);
      clearSaveBtn.replaceWith(newSave);
      clearCancelBtn.replaceWith(newCancel);
      
      const cleanup = () => {
        modal.style.display = 'none';
        msg.textContent = originalMsg;
        // Restore original handlers by replacing nodes back (quickest way is to re-run event attachment logic, but simpler to just reload the page since we are navigating away anyway)
      };

      newCancel.addEventListener('click', () => {
        cleanup();
        // Restore clear button events by reloading them
        window.location.reload(); 
      });
      newDontSave.addEventListener('click', () => { window.location.href = targetUrl; });
      newSave.addEventListener('click', () => {
        modal.style.display = 'none';
        openSaveProjectModal(() => { window.location.href = targetUrl; });
      });
    } else {
      window.location.href = targetUrl;
    }
  }

  document.getElementById('user-menu-account')?.addEventListener('click', () => { navigateWithSaveGuard('/account.html'); });
  document.getElementById('user-menu-projects')?.addEventListener('click', () => { navigateWithSaveGuard('/projects.html'); });
  document.getElementById('user-menu-save')?.addEventListener('click', () => { openSaveProjectModal(); });
  document.getElementById('user-menu-logout')?.addEventListener('click', () => {
    localStorage.removeItem('darkeye_token');
    localStorage.removeItem('darkeye_user');
    window.location.href = '/login.html';
  });

  // ===== Save Project Button =====
  document.getElementById('save-project-btn')?.addEventListener('click', () => { openSaveProjectModal(); });

  // Save modal cancel/confirm
  document.getElementById('save-project-cancel')?.addEventListener('click', () => {
    document.getElementById('save-project-modal').style.display = 'none';
  });
  document.getElementById('save-project-confirm')?.addEventListener('click', () => { saveProject(); });

  // ===== Load project from projects page =====
  const loadProjectId = localStorage.getItem('darkeye_load_project');
  if (loadProjectId) {
    localStorage.removeItem('darkeye_load_project');
    loadProjectFromServer(loadProjectId);
  }

  loadLimitSelector.addEventListener('change', () => {
    const val = loadLimitSelector.value;
    currentSearchLimit = val ? parseInt(val, 10) : null;
  });

  // Load Next button simply triggers a new search (will show append popup)
  if (btnLoadNext) {
    btnLoadNext.addEventListener('click', () => {
      handleAnalyzeSearch();
    });
  }

  searchInput.addEventListener('keydown', (e) => {
    // Shift+Enter adds a new line, Enter alone triggers search
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAnalyzeSearch();
    }
    // Allow Shift+Enter to add new line naturally
  });

  // Auto-resize textarea on input
  searchInput.addEventListener('input', autoResizeTextarea);

  // Legend Toggle Logic
  const btnToggleLegend = document.getElementById('btn-toggle-legend');
  const legendPanel = document.getElementById('legend-panel');
  if (btnToggleLegend && legendPanel) {
    btnToggleLegend.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = legendPanel.style.display === 'block';
      legendPanel.style.display = isVisible ? 'none' : 'block';
      btnToggleLegend.style.color = isVisible ? '' : 'var(--accent-cyan)';
    });

    document.addEventListener('click', (e) => {
      if (!legendPanel.contains(e.target) && e.target !== btnToggleLegend && !btnToggleLegend.contains(e.target)) {
        legendPanel.style.display = 'none';
        btnToggleLegend.style.color = '';
      }
    });
  }

  // Dynamic Multi-Domain Options Visibility
  const updateMultiDomainOptionsVisibility = () => {
    const lines = searchInput.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length >= 2) {
      multiDomainOptions.style.display = 'flex';
    } else {
      multiDomainOptions.style.display = 'none';
    }
  };

  searchInput.addEventListener('input', updateMultiDomainOptionsVisibility);
  searchField.addEventListener('change', updateMultiDomainOptionsVisibility);

  // Auto-connect domains checkbox
  autoConnectDomainsCheckbox?.addEventListener('change', (e) => {
    autoConnectDomains = e.target.checked;

    // Dynamic Reconnection implementation
    if (graphManager && graphManager.allNodesData.length > 0) {
      // Find all central hub root nodes (domain types are used for emails, usernames, and domains)
      const roots = graphManager.allNodesData.filter(n => n.type === 'domain');

      if (roots.length > 1) {
        if (autoConnectDomains) {
          // Add edges linking all roots
          const newEdges = [];
          for (let i = 0; i < roots.length; i++) {
            for (let j = i + 1; j < roots.length; j++) {
              const edgeId = `edge_${Date.now()}_${i}_${j}_${roots[i].id}_${roots[j].id}`;
              const exists = graphManager.allEdgesData.find(edge =>
                (edge.from === roots[i].id && edge.to === roots[j].id) ||
                (edge.from === roots[j].id && edge.to === roots[i].id)
              );

              if (!exists) {
                newEdges.push({
                  id: edgeId,
                  from: roots[i].id,
                  to: roots[j].id,
                  type: 'domain-domain'
                });
              }
            }
          }
          if (newEdges.length > 0) {
            graphManager.batchAdd([], newEdges); // Batch add directly invokes network update
            showToast('Root nodes dynamically connected', 'info');
          }
        } else {
          // Sever all domain-domain links dynamically
          const edgesToWipe = graphManager.allEdgesData.filter(e => e.type === 'domain-domain');
          if (edgesToWipe.length > 0) {
            edgesToWipe.forEach(edge => {
              graphManager.deleteEdge(edge.id, true);
            });
            showToast('Root nodes disconnected', 'info');
          }
        }

        // Refresh the active physics/layout mathematically without resetting position entirely unless hierarchical forces it
        graphManager.setMode(graphManager.layoutMode, true);
      }
    }
  });

  // File upload handling
  uploadBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', handleFileUpload);
  btnDeleteNode.addEventListener('click', handleDeleteNode);
  btnConnectUsers.addEventListener('click', handleConnectUsers);
  btnConnectDomains.addEventListener('click', handleConnectDomains);
  btnAnalyzeUsers.addEventListener('click', handleAIAnalysis);

  // Physics settings menu toggle
  physicsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = physicsMenu.style.display === 'block';
    // Close other menus
    contextMenu.style.display = 'none';

    physicsMenu.style.display = isVisible ? 'none' : 'block';
  });

  // Select physics option
  physicsMenu.querySelectorAll('.physics-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = e.currentTarget.dataset.physics;
      graphManager.setPhysics(mode);

      // Save configuration securely
      localStorage.setItem('visPhysicsConfig', mode);

      // Update UI highlights
      physicsMenu.querySelectorAll('.physics-item').forEach(el => el.classList.remove('active'));
      e.currentTarget.classList.add('active');

      showToast(`Graph physics set to ${mode}`, 'info');
      // physicsMenu.style.display = 'none'; // Keep open for Mode switch
    });
  });

  // Select layout mode option
  physicsMenu.querySelectorAll('.mode-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = e.currentTarget.dataset.mode;
      graphManager.setMode(mode);

      localStorage.setItem('visModeConfig', mode);

      // Update UI highlights
      physicsMenu.querySelectorAll('.mode-item').forEach(el => el.classList.remove('active'));
      e.currentTarget.classList.add('active');

      showToast(`Graph mode set to ${mode === 'hierarchical' ? 'Tree Map' : 'Centralized'}`, 'info');
    });
  });

  // Hide menus on click outside
  document.addEventListener('click', (e) => {
    if (contextMenu.style.display === 'block') {
      contextMenu.style.display = 'none';
    }
    if (physicsMenu.style.display === 'block' && !physicsBtn.contains(e.target) && !physicsMenu.contains(e.target)) {
      physicsMenu.style.display = 'none';
    }
  });
  btnStopAnalysis.addEventListener('click', handleStopAnalysis);
  btnKillAnalysis.addEventListener('click', handleKillAnalysis);
  btnStopShowAllData.addEventListener('click', handleToggleShowAllData);

  // Explore / Preidentify buttons
  btnExploreUsers.addEventListener('click', handleExploreAllUsersData);
  btnPreidentifyUsers.addEventListener('click', handlePreidentifyAllUsers);
  btnAmplifyUsers.addEventListener('click', handleAmplifyUsers);
  btnShowAllUsersData.addEventListener('click', handleShowAllUsersData);
  btnToggleExploration.addEventListener('click', handleToggleExplorationData);

  btnStopExplore.addEventListener('click', handleStopExplore);
  btnKillExplore.addEventListener('click', handleKillExplore);

  // Subdomain discovery button
  btnSubdomains.addEventListener('click', handleSubdomainDiscovery);

  // Initialize display state
  btnSubdomains.style.display = searchField.value === 'domain' ? '' : 'none';

  // Show/hide subdomain button based on search field
  searchField.addEventListener('change', () => {
    btnSubdomains.style.display = searchField.value === 'domain' ? '' : 'none';
  });

  // Country filter
  filterCountry.addEventListener('change', () => {
    if (graphManager && filtersManager) {
      handleFiltersChange(filtersManager.getState());
    }
  });

  // Context menu items
  ctxExploreUser.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) handleExploreUserData(target.nodeId);
  });
  ctxAnalyzeUser.addEventListener('click', () => {
    if (ctxAnalyzeUser.classList.contains('disabled')) return;
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) handleAnalyzeUserAI(target.nodeId);
  });
  ctxAmplifySuperuser.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target && target.nodeType === 'superuser') {
      const suNode = graphManager.getSuperuserNodeById(target.nodeId);
      if (suNode) handleAmplifySingleSuperuser(suNode);
    }
  });
  ctxAutopivotEmails.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target && target.nodeData.type === 'superuser') {
      handleAutopivotEmails(target.nodeId);
    }
  });
  ctxAutopivotPhones.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target && target.nodeData.type === 'superuser') {
      handleAutopivotPhones(target.nodeId);
    }
  });
  ctxShowUserData.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) {
      handleShowUserData(target.nodeId, target.nodeData.type);
    }
  });

  ctxShowSupernode.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target && target.nodeData.type === 'superuser') {
      try {
        // Find all users linked to this master parent superuser
        const childUserEdges = graphManager.edgesDataset.get({
          filter: e => e.from === target.nodeId && (e.type === 'superuser-user' || e.type === 'superuser-new-user')
        });

        let unhiddenCount = 0;
        childUserEdges.forEach(edge => {
          const uNodeRaw = graphManager.getUserNodeById(edge.to);
          if (uNodeRaw && uNodeRaw._superuserId) {
            const nestedSuId = uNodeRaw._superuserId;
            const nestedSu = graphManager.nodesDataset.get(nestedSuId);
            if (nestedSu && nestedSu.hidden) {
              graphManager.nodesDataset.update({ id: nestedSuId, hidden: false });
              const edgesToUnhide = graphManager.edgesDataset.get({
                filter: e => e.from === nestedSuId && e.to === uNode.id && e.hidden === true
              });
              edgesToUnhide.forEach(e => e.hidden = false);
              graphManager.edgesDataset.update(edgesToUnhide);
              unhiddenCount++;
            }
          }
        });

        if (unhiddenCount > 0) graphManager.network.fit(); // Refresh view lightly if things appeared
      } catch (err) {
        console.error('Failed to unhide nested supernodes:', err);
      }
    }
  });

  ctxShowSocial.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (!target) return;

    if (target.nodeData.type === 'user_detail_service') {
      const platformName = target.nodeData.label.toLowerCase();
      // The parent node (username) is linked to this platform
      const edges = graphManager.allEdgesData.filter(e => e.to === target.nodeId || e.from === target.nodeId);
      let usernameNode = null;
      for (const e of edges) {
        const otherId = e.from === target.nodeId ? e.to : e.from;
        const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
        if (otherNode && otherNode.type === 'user_detail') {
          usernameNode = otherNode;
          break;
        }
      }

      if (usernameNode && (platformName.includes('instagram') || platformName.includes('tiktok') || platformName.includes('pinterest') || platformName.includes('x') || platformName.includes('twitter') || platformName.includes('steam'))) {
        let actualPlatform = platformName.includes('instagram') ? 'instagram' : (platformName.includes('tiktok') ? 'tiktok' : (platformName.includes('pinterest') ? 'pinterest' : (platformName.includes('steam') ? 'steam' : 'x')));
        const scrapeName = getSocialUsername(usernameNode.label, actualPlatform);
        fetchSocialDataForUsername(scrapeName, actualPlatform, target.nodeId);
      } else if (usernameNode && platformName.includes('github')) {
        const scrapeName = getSocialUsername(usernameNode.label, 'github');
        fetchGitHubProfile(scrapeName, target.nodeId);
      } else {
        showToast('Only Instagram, TikTok, Pinterest, X/Twitter, Steam, and GitHub are supported for scraping.', 'warning');
      }
    } else if (target.nodeData.type === 'user_detail') {
      // Find platforms connected to this username
      const edges = graphManager.allEdgesData.filter(e => e.to === target.nodeId || e.from === target.nodeId);
      let found = false;
      for (const e of edges) {
        const otherId = e.from === target.nodeId ? e.to : e.from;
        const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
        if (otherNode && otherNode.type === 'user_detail_service') {
          const lbl = (otherNode.label || '').toLowerCase();
          if (lbl.includes('instagram') || lbl.includes('tiktok') || lbl.includes('pinterest') || lbl.includes('x') || lbl.includes('twitter') || lbl.includes('steam')) {
            const platform = lbl.includes('instagram') ? 'instagram' : (lbl.includes('tiktok') ? 'tiktok' : (lbl.includes('pinterest') ? 'pinterest' : (lbl.includes('steam') ? 'steam' : 'x')));
            const scrapeName = getSocialUsername(target.nodeData.label, platform);
            fetchSocialDataForUsername(scrapeName, platform, otherNode.id);
            found = true;
          } else if (lbl.includes('github')) {
            const scrapeName = getSocialUsername(target.nodeData.label, 'github');
            fetchGitHubProfile(scrapeName, otherNode.id);
            found = true;
          }
        }
      }
      if (!found) {
        showToast('No supported social platforms (Instagram/TikTok/Pinterest/X/Steam/GitHub) found for this username.', 'warning');
      }
    }
  });

  ctxShowAllSocial.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target && target.nodeData.type === 'superuser') {
      handleShowAllSocialForSuperuser(target.nodeId);
    }
  });

  if (btnShowTopSocial) {
    btnShowTopSocial.addEventListener('click', handleShowTopSocialNetworks);
  }

  if (imageModalClose) {
    imageModalClose.addEventListener('click', () => {
      imageModal.style.display = 'none';
      imageModalImg.src = '';
    });
    imageModal.addEventListener('click', (e) => {
      if (e.target === imageModal) {
        imageModal.style.display = 'none';
        imageModalImg.src = '';
      }
    });
  }
  ctxExploreIdentify.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) handleExploreAndIdentify(target.nodeId);
  });
  if (ctxExploreTransactions) {
    ctxExploreTransactions.addEventListener('click', () => {
      const target = contextMenuTargetNode;
      hideContextMenu();
      if (target) handleExploreTransactions(target.nodeId);
    });
  }
  if (ctxDeleteEdge) {
    ctxDeleteEdge.addEventListener('click', () => {
      const edge = contextMenuTargetEdge;
      hideContextMenu();
      if (edge) {
        graphManager.deleteEdge(edge);
        if (typeof updateStats === 'function') updateStats();
      }
    });
  }

  // New Context Menu Actions
  ctxDeleteDomain.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) {
      if (typeof graphManager.deleteDomainHard === 'function') graphManager.deleteDomainHard(target.nodeId);
      if (typeof updateStats === 'function') updateStats();
    }
  });

  ctxDeleteDomainCascading.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) {
      if (typeof graphManager.deleteDomainCascading === 'function') graphManager.deleteDomainCascading(target.nodeId);
      if (typeof updateStats === 'function') updateStats();
    }
  });

  ctxRemoveGroup.addEventListener('click', () => {
    hideContextMenu();
    const selection = graphManager.network.getSelection();
    if (selection && selection.nodes && selection.nodes.length > 0) {
      if (typeof graphManager.deleteNodes === 'function') graphManager.deleteNodes(selection.nodes);
      graphManager._handleDeselect();
      if (typeof updateStats === 'function') updateStats();
    }
  });

  ctxCopyGroup.addEventListener('click', () => {
    hideContextMenu();
    const selection = graphManager.network.getSelection();
    if (selection && selection.nodes && selection.nodes.length > 0) {
      if (typeof graphManager.copyNodes === 'function') graphManager.copyNodes(selection.nodes);
    }
  });

  ctxDeleteNodeAction.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) {
      graphManager.deleteNode(target.nodeId);
      if (typeof updateStats === 'function') updateStats();
    }
  });

  ctxConnectNodeAction.addEventListener('click', () => {
    const target = contextMenuTargetNode;
    hideContextMenu();
    if (target) {
      graphManager.selectedNodeId = target.nodeId;
      if (target.nodeData.type === 'domain') {
        handleConnectDomains();
      } else {
        handleConnectUsers();
      }
    }
  });

  // Keyboard Shortcuts (Delete & Undo)
  document.addEventListener('keydown', (e) => {
    // Avoid triggering when user is typing in inputs or textareas
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Delete key
    if (e.key === 'Delete') {
      const selection = graphManager.network.getSelection();
      if (selection && selection.nodes && selection.nodes.length > 0) {
        if (typeof graphManager.deleteNodes === 'function') {
          graphManager.deleteNodes(selection.nodes);
        } else {
          selection.nodes.forEach(n => graphManager.deleteNode(n));
        }
        graphManager._handleDeselect();
        if (typeof updateStats === 'function') updateStats();
      } else if (selection && selection.edges && selection.edges.length > 0) {
        selection.edges.forEach(edgeId => graphManager.deleteEdge(edgeId));
        graphManager._handleDeselect();
        if (typeof updateStats === 'function') updateStats();
      }
    }

    // Ctrl + Z (Undo)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (typeof graphManager.undoLastAction === 'function') {
        graphManager.undoLastAction();
        if (typeof updateStats === 'function') updateStats();
      }
    }
  });

  // Close context menu on click elsewhere
  document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // AI button hover effect — blink explore button when disabled
  btnAnalyzeUsers.addEventListener('mouseenter', () => {
    if (btnAnalyzeUsers.disabled && btnAnalyzeUsers.classList.contains('needs-exploration')) {
      btnExploreUsers.classList.add('blink');
    }
  });
  btnAnalyzeUsers.addEventListener('mouseleave', () => {
    btnExploreUsers.classList.remove('blink');
  });

  // Remove initial loader
  setTimeout(() => {
    const loader = document.getElementById('initial-app-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 400);
    }
  }, 300);
}

// ===== Search Analysis =====
async function handleAnalyzeSearch() {
  // Get search field and terms
  const field = searchField.value;
  const rawInput = searchInput.value.trim();

  if (!rawInput) {
    showToast('Please enter search terms', 'warning');
    return;
  }

  // Check if graph already has data and prompt the user
  let appendMode = false;
  if (graphManager && graphManager.allNodesData.length > 0) {
    const choice = await new Promise(resolve => {
      searchAppendModal.style.display = 'flex';
      const closeBtn = document.getElementById('btn-search-append-close');

      const cleanup = (value) => {
        btnSearchClear.removeEventListener('click', onClear);
        btnSearchAppend.removeEventListener('click', onAppend);
        if (closeBtn) closeBtn.removeEventListener('click', onClose);
        searchAppendModal.removeEventListener('click', onOverlayClick);
        searchAppendModal.style.display = 'none';
        resolve(value);
      };

      const onClear = () => cleanup('clear');
      const onAppend = () => cleanup('append');
      const onClose = () => cleanup('cancel');
      const onOverlayClick = (e) => { if (e.target === searchAppendModal) cleanup('cancel'); };

      btnSearchClear.addEventListener('click', onClear);
      btnSearchAppend.addEventListener('click', onAppend);
      if (closeBtn) closeBtn.addEventListener('click', onClose);
      searchAppendModal.addEventListener('click', onOverlayClick);
    });

    if (choice === 'cancel') {
      return; // User closed the popup without choosing
    } else if (choice === 'clear') {
      handleCleanEverything();
    } else {
      appendMode = true;
    }
  }

  // Split by lines and filter empty lines
  const terms = rawInput.split('\n')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  if (terms.length === 0) {
    showToast('Please enter at least one search term', 'warning');
    return;
  }

  if (isAnalyzing) return;
  isAnalyzing = true;
  searchController = { aborted: false, paused: false };
  currentSearchField = field;
  currentSearchTerms = terms;
  analyzeBtn.disabled = true;
  stopAnalysisBtn.disabled = false;
  killSearchBtn.disabled = false;
  killSearchBtn.style.display = 'inline-block';
  stopAnalysisBtn.innerHTML = '<i class="fas fa-stop"></i>';

  // Show multi-domain/hub options if multiple terms are searched, for ANY search field
  if (terms.length > 1) {
    multiDomainOptions.style.display = 'flex';
  } else {
    multiDomainOptions.style.display = 'none';
  }

  // Show loading
  graphPlaceholder.style.display = 'none';
  loadingOverlay.style.display = 'flex';

  let allMetadata = [];
  let allFullData = [];
  let allStealerData = [];
  const callLimit = currentSearchLimit === 60 ? 20 : (currentSearchLimit === 150 ? 50 : (currentSearchLimit === 300 ? 100 : (currentSearchLimit === 600 ? 200 : null)));
  const dataSource = dataSourceSelector ? dataSourceSelector.value : 'all';

  try {

    const handlePauseScope = async () => {
      if (searchController.paused) {
        const primaryLabel = field === 'domain' ? terms.join(' + ') : `${field} search`;
        const currentAutoConnect = autoConnectDomainsCheckbox ? autoConnectDomainsCheckbox.checked : autoConnectDomains;
        const processed = processData(primaryLabel, allMetadata, allFullData, allStealerData, terms, currentAutoConnect, field);

        if (processed.nodes.length > 0) {
          if (appendMode) {
            graphManager.appendData(processed);
          } else {
            graphManager.loadData(processed);
          }
          populateCountryFilter(graphManager.allNodesData);
          graphManager.applyFilters(filtersManager.getState());
        }

        loadingOverlay.style.display = 'none';
        stopAnalysisBtn.innerHTML = '<i class="fas fa-play"></i>';
        stopAnalysisBtn.classList.remove('danger');
        stopAnalysisBtn.classList.add('success');

        await new Promise(resolve => {
          const interval = setInterval(() => {
            if (!searchController.paused || searchController.aborted) {
              clearInterval(interval);
              resolve();
            }
          }, 200);
        });

        if (!searchController.aborted) {
          loadingOverlay.style.display = 'flex';
          stopAnalysisBtn.innerHTML = '<i class="fas fa-stop"></i>';
          stopAnalysisBtn.classList.add('danger');
          stopAnalysisBtn.classList.remove('success');
        }
      }
    };

    if (field === 'domain') {
      // Process each domain
      for (let i = 0; i < terms.length; i++) {
        if (searchController.aborted) throw new Error('Search aborted');

        const term = terms[i];
        loadingText.textContent = `Searching ${term} (${i + 1}/${terms.length})...`;
        const onProgress = (msg) => {
          loadingText.textContent = `Searching ${term} (${i + 1}/${terms.length}) - ${msg}`;
        };

        if (dataSource === 'all' || dataSource === 'breaches') {
          for await (const batch of searchMetadata(term, onProgress, callLimit)) {
            const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
            allMetadata.push(...taggedBatch);
            await handlePauseScope();
            if (searchController.aborted) break;
          }
          if (searchController.aborted) throw new Error('Search aborted');

          for await (const batch of searchFullData(term, onProgress, callLimit)) {
            const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
            allFullData.push(...taggedBatch);
            await handlePauseScope();
            if (searchController.aborted) break;
          }
          if (searchController.aborted) throw new Error('Search aborted');
        }

        if (dataSource === 'all' || dataSource === 'infostealers') {
          for await (const batch of searchFullStealerByField('domain', term, onProgress, callLimit)) {
            const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
            allStealerData.push(...taggedBatch);
            await handlePauseScope();
            if (searchController.aborted) break;
          }
          if (searchController.aborted) throw new Error('Search aborted');

          try {
            for await (const batch of searchFullStealerEmployees(term, onProgress, callLimit)) {
              const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
              allStealerData.push(...taggedBatch);
              await handlePauseScope();
              if (searchController.aborted) break;
            }
          } catch (e) {
            console.warn(`[Search] No domain employees data for ${term}:`, e.message);
          }
        }
      }
    } else if (field === 'email' || field === 'username' || field === 'name' || field === 'phone') {
      // For user-identifying fields, we can search both breach and stealer data
      for (let i = 0; i < terms.length; i++) {
        if (searchController.aborted) throw new Error('Search aborted');

        const term = terms[i];
        loadingText.textContent = `Searching ${field}: ${term} (${i + 1}/${terms.length})...`;
        const onProgress = (msg) => {
          loadingText.textContent = `Searching ${field}: ${term} (${i + 1}/${terms.length}) - ${msg}`;
        };

        if (dataSource === 'all' || dataSource === 'breaches') {
          try {
            for await (const batch of searchFullDataByField(field, term, onProgress, callLimit)) {
              const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
              allFullData.push(...taggedBatch);
              await handlePauseScope();
              if (searchController.aborted) break;
            }
          } catch (e) {
            console.warn(`[Search] No breach data for ${term}:`, e.message);
          }
          if (searchController.aborted) throw new Error('Search aborted');
        }

        if (dataSource === 'all' || dataSource === 'infostealers') {
          try {
            for await (const batch of searchFullStealerByField(field, term, onProgress, callLimit)) {
              const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
              allStealerData.push(...taggedBatch);
              await handlePauseScope();
              if (searchController.aborted) break;
            }
          } catch (e) {
            console.warn(`[Search] No stealer data for ${term}:`, e.message);
          }

          // For phone searches, also query the /fullstealer/telephone/ endpoint
          if (field === 'phone') {
            try {
              for await (const batch of searchFullStealerByField('telephone', term, onProgress, callLimit)) {
                const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
                allStealerData.push(...taggedBatch);
                await handlePauseScope();
                if (searchController.aborted) break;
              }
            } catch (e) {
              console.warn(`[Search] No stealer telephone data for ${term}:`, e.message);
            }
          }
        }
      }
    } else if (field === 'wallets' || field === 'steamid' || field === 'steamuser' ||
      field === 'teleid' || field === 'teleuser' || field === 'telephone' ||
      field === 'telelink' || field === 'vpn' || field === 'ftp' || field === 'hwid') {
      // These fields are only available in stealer data
      for (let i = 0; i < terms.length; i++) {
        if (searchController.aborted) throw new Error('Search aborted');

        const term = terms[i];
        loadingText.textContent = `Searching ${field}: ${term} (${i + 1}/${terms.length})...`;
        const onProgress = (msg) => {
          loadingText.textContent = `Searching ${field}: ${term} (${i + 1}/${terms.length}) - ${msg}`;
        };

        try {
          for await (const batch of searchFullStealerByField(field, term, onProgress, callLimit)) {
            const taggedBatch = batch.map(b => ({ ...b, search_term: term }));
            allStealerData.push(...taggedBatch);
            await handlePauseScope();
            if (searchController.aborted) break;
          }
        } catch (e) {
          console.warn(`[Search] No stealer data for ${term}:`, e.message);
        }
      }
    } else {
      showToast(`Field '${field}' not yet supported`, 'warning');
      isAnalyzing = false;
      analyzeBtn.disabled = false;
      loadingOverlay.style.display = 'none';
      graphPlaceholder.style.display = 'flex';
      return;
    }

    if (searchController.aborted) throw new Error('Search aborted');

    // Process data
    loadingText.textContent = 'Processing data and building graph...';
    console.log(`[Main] Data received - Metadata: ${allMetadata.length}, FullData: ${allFullData.length}, StealerData: ${allStealerData.length}`);

    // Pass search terms for multi-domain support
    const primaryLabel = field === 'domain' ? terms.join(' + ') : `${field} search`;
    // Always read current checkbox state for auto-connect
    const currentAutoConnect = autoConnectDomainsCheckbox ? autoConnectDomainsCheckbox.checked : autoConnectDomains;
    const processed = processData(primaryLabel, allMetadata, allFullData, allStealerData, terms, currentAutoConnect, field);
    console.log(`[Main] Processed graph - Nodes: ${processed.nodes.length}, Edges: ${processed.edges.length}`);
    console.log('[Main] Stats:', {
      services: processed.services.size,
      users: processed.users.size
    });

    if (processed.nodes.length <= 1 && !appendMode) {
      console.warn('[Main] No nodes generated (only domain node present)');
      showToast('No breach data found for search terms', 'info');
      graphPlaceholder.style.display = 'flex';
      loadingOverlay.style.display = 'none';
      isAnalyzing = false;
      analyzeBtn.disabled = false;
      return;
    }

    // Load or append into graph
    if (appendMode) {
      graphManager.appendData(processed);
    } else {
      graphManager.loadData(processed);
    }

    // Populate country filter dropdown
    populateCountryFilter(graphManager.allNodesData);

    updateAIButtonState();
    autoConnectDomainsCheckbox.disabled = false;
    // Apply default filters (hideExternal is checked by default)
    graphManager.applyFilters(filtersManager.getState());

    // Update stats
    const stats = graphManager.getStats();
    statServices.textContent = stats.services;
    statUsers.textContent = stats.users;
    statConnections.textContent = stats.connections;

    // Show domain count if multi-domain search
    if (stats.domains > 1) {
      // Show domains instead of hostnames in the label
      statServices.parentElement.querySelector('.stat-label').textContent = 'Domains';
      statServices.textContent = stats.domains;
    }

    headerStats.style.display = 'flex';

    // Enable explore button, but AI needs exploration first
    btnExploreUsers.disabled = false;
    updateAIButtonState();

    // Show multi-domain options always after search
    multiDomainOptions.style.display = 'flex';

    const termText = terms.length === 1 ? `"${terms[0]}"` : `${terms.length} domains`;
    const statsSummary = stats.domains > 1
      ? `${stats.domains} domains, ${stats.services} hostnames and ${stats.users} users`
      : `${stats.services} hostnames and ${stats.users} users`;

    // Re-apply layout config after node addition
    if (graphManager && graphManager.layoutMode) {
      graphManager.setMode(graphManager.layoutMode);
    }

    // Show Load Next button if a limit is set
    if (currentSearchLimit && btnLoadNext) {
      btnLoadNext.textContent = `Load next ${currentSearchLimit}`;
      btnLoadNext.style.display = 'inline-flex';
    } else if (btnLoadNext) {
      btnLoadNext.style.display = 'none';
    }

    showToast(`Found ${statsSummary} for ${termText}`, 'success');

    // After appending new data, recommend re-exploration
    if (appendMode) {
      await showReExplorePopup();
    }
  } catch (error) {
    if (error.message === 'Search aborted') {
      showToast('Search was explicitly killed. Rendering partial data...', 'warning');
      if (allMetadata.length > 0 || allFullData.length > 0 || allStealerData.length > 0) {
        const primaryLabel = field === 'domain' ? terms.join(' + ') : `${field} search`;
        const currentAutoConnect = autoConnectDomainsCheckbox ? autoConnectDomainsCheckbox.checked : autoConnectDomains;
        const processed = processData(primaryLabel, allMetadata, allFullData, allStealerData, terms, currentAutoConnect);
        if (processed.nodes.length > 0) {
          if (appendMode) {
            graphManager.appendData(processed);
          } else {
            graphManager.loadData(processed);
          }
          populateCountryFilter(graphManager.allNodesData);
          graphManager.applyFilters(filtersManager.getState());

          btnExploreUsers.disabled = false;
          updateAIButtonState();

          const stats = graphManager.getStats();
          statServices.textContent = stats.services;
          statUsers.textContent = stats.users;
          statConnections.textContent = stats.connections;
          if (stats.domains > 1) {
            statServices.parentElement.querySelector('.stat-label').textContent = 'Domains';
            statServices.textContent = stats.domains;
          }
          headerStats.style.display = 'flex';
          multiDomainOptions.style.display = 'flex';
        } else {
          graphPlaceholder.style.display = 'flex';
        }
      } else {
        graphPlaceholder.style.display = 'flex';
      }
    } else {
      console.error('Analysis error:', error);
      showToast(`Error: ${error.message}`, 'error');
      graphPlaceholder.style.display = 'flex';
    }
  } finally {
    loadingOverlay.style.display = 'none';
    if (searchController && !searchController.aborted) {
      isAnalyzing = false;
      searchController = null;
    } else {
      isAnalyzing = false;
      searchController = null;
    }
    analyzeBtn.disabled = false;
    stopAnalysisBtn.disabled = true;
    stopAnalysisBtn.innerHTML = '<svg viewBox="0 0 20 20" fill="none"><rect x="6" y="6" width="8" height="8" fill="currentColor" /></svg>';
    stopAnalysisBtn.classList.remove('success', 'danger');
    killSearchBtn.disabled = true;
    killSearchBtn.style.display = 'none';

    // Auto-enable exploration if nodes exist post-abort
    if (graphManager && graphManager.allNodesData.length > 0) {
      btnExploreUsers.disabled = false;
    }
  }
}

// ===== Stop Search Analysis =====
function handleStopSearchAnalysis() {
  if (searchController) {
    if (searchController.paused) {
      searchController.paused = false;
      showToast('Resuming search API calls...', 'info');
    } else {
      searchController.paused = true;
      showToast('Pausing search fetches. Rendering available data...', 'warning');
    }
  }
}

// ===== Kill Search Analysis =====
function handleKillSearchAnalysis() {
  if (searchController) {
    searchController.aborted = true;
    searchController.paused = false; // abort breaks pause loop
    showToast('Killing search aggressively...', 'error');
  }
}

// ===== Project Management =====
let saveSuccessCallback = null;

function getProjectStats() {
  if (!graphManager || !graphManager.allNodesData) return { primary: 0, superusers: 0, total: 0 };
  const nodes = graphManager.allNodesData;
  const primary = nodes.filter(n => n.group === 'search_target' || n.level === 0 || n.level === 1).length;
  const superusers = nodes.filter(n => n.type === 'superuser').length;
  return { primary, superusers, total: nodes.length };
}

function generateAutoDescription() {
  if (!graphManager || !graphManager.allNodesData) return '';
  const nodes = graphManager.allNodesData;
  
  // Find main search targets (level 0 or search_target group)
  const targets = nodes.filter(n => n.group === 'search_target' || n.level === 0).map(n => n.label).slice(0, 5);
  let desc = 'Exploration of: ' + (targets.length > 0 ? targets.join(', ') : 'Unknown target');
  
  const stats = getProjectStats();
  desc += `\nFound ${stats.superusers} superusers and ${stats.total} total nodes.`;
  return desc;
}

function openSaveProjectModal(onSuccess = null) {
  saveSuccessCallback = onSuccess;
  const modal = document.getElementById('save-project-modal');
  const nameInput = document.getElementById('save-project-name');
  const descInput = document.getElementById('save-project-desc');
  const overwriteSection = document.getElementById('save-project-overwrite-section');
  const statsDiv = document.getElementById('save-project-stats');
  
  // Pre-fill
  if (currentProjectName) {
    nameInput.value = currentProjectName;
    overwriteSection.style.display = 'block';
  } else {
    nameInput.value = '';
    overwriteSection.style.display = 'none';
  }
  
  descInput.value = generateAutoDescription();
  
  const stats = getProjectStats();
  statsDiv.innerHTML = `
    <span><i class="fas fa-bullseye"></i> ${stats.primary} Primary Nodes</span>
    <span><i class="fas fa-users-cog"></i> ${stats.superusers} Superusers</span>
    <span><i class="fas fa-project-diagram"></i> ${stats.total} Total Nodes</span>
  `;
  
  modal.style.display = 'flex';
  nameInput.focus();
}

async function saveProject() {
  const nameInput = document.getElementById('save-project-name');
  const descInput = document.getElementById('save-project-desc');
  const modeRadio = document.querySelector('input[name="save-mode"]:checked');
  const confirmBtn = document.getElementById('save-project-confirm');
  const modal = document.getElementById('save-project-modal');
  
  const name = nameInput.value.trim();
  if (!name) {
    showToast('Project name is required', 'error');
    nameInput.focus();
    return;
  }
  
  const stats = getProjectStats();
  
  // Serialize graph
  let graphData = null;
  if (graphManager && graphManager.allNodesData && graphManager.allEdgesData) {
    // Reconstruct services and users maps for saving
    const servicesMap = new Map();
    const usersMap = new Map();
    
    graphManager.allNodesData.forEach(n => {
      if (n.type === 'service' || n.group === 'service') {
        servicesMap.set(n.id, n._data || n);
      } else if (n.type === 'user' || n.type === 'superuser' || n.group === 'user') {
        usersMap.set(n.id, n._data || n);
      }
    });

    // Get active Physics Mode
    const activeMode = document.querySelector('#physics-settings-menu .mode-item.active')?.dataset.mode || 'centralized';
    let activePhysics = null;
    if (activeMode === 'centralized') {
      activePhysics = Object.values(document.querySelectorAll('#physics-settings-menu .physics-item.active'))
                             .map(el => el.dataset.physics)[0] || 'fast';
    }

    // Get active Filters
    const filtersState = filtersManager ? Array.from(filtersManager.activeFilters) : [];

    graphData = {
      nodes: graphManager.allNodesData,
      edges: graphManager.allEdgesData,
      // Convert maps to arrays for JSON serialization
      services: Array.from(servicesMap.entries()),
      users: Array.from(usersMap.entries()),
      physics: { mode: activeMode, config: activePhysics },
      filters: filtersState
    };
  }
  
  const payload = {
    name,
    description: descInput.value.trim(),
    graph_data: graphData,
    primary_nodes_count: stats.primary,
    superusers_count: stats.superusers,
    total_nodes_count: stats.total
  };
  
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  
  try {
    let url = `${BACKEND_URL}/api/v1/projects`;
    let method = 'POST';
    
    // If editing an existing project and chose overwrite, use PUT
    // If saving as new version, use POST to /version
    // Otherwise, normal POST
    if (currentProjectId) {
      if (modeRadio && modeRadio.value === 'overwrite') {
        url = `${BACKEND_URL}/api/v1/projects/${currentProjectId}`;
        method = 'PUT';
      } else if (modeRadio && modeRadio.value === 'new-version') {
        url = `${BACKEND_URL}/api/v1/projects/${currentProjectId}/version`;
        method = 'POST';
      }
    }
    
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${darkeyeToken}`
      },
      body: JSON.stringify(payload)
    });
    
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    
    if (!res.ok) throw new Error('Failed to save project');
    
    const saved = await res.json();
    currentProjectId = saved.id;
    currentProjectName = saved.name;
    
    showToast(`Project "${saved.name}" v${saved.version} saved successfully!`, 'success');
    modal.style.display = 'none';
    
    if (saveSuccessCallback) {
      saveSuccessCallback();
      saveSuccessCallback = null;
    }
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<i class="fas fa-save"></i> Save';
  }
}

async function loadProjectFromServer(projectId) {
  try {
    showToast('Loading project...', 'info');
    document.getElementById('initial-app-loader').style.display = 'flex';
    document.getElementById('initial-app-loader').style.opacity = '1';
    
    // Show spinner UI for rendering
    exploreProgressContainer.style.display = 'flex';
    exploreProgressText.textContent = 'Downloading project data...';

    const res = await fetch(`${BACKEND_URL}/api/v1/projects/${projectId}`, {
      headers: { 'Authorization': `Bearer ${darkeyeToken}` }
    });
    
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (!res.ok) throw new Error('Failed to load project');
    
    const project = await res.json();
    currentProjectId = project.id;
    currentProjectName = project.name;
    
    exploreProgressText.textContent = 'Rendering graph layout...';

    // Restore state
    handleCleanEverything(); // Reset UI
    
    if (project.graph_data) {
      const data = project.graph_data;
      if (graphManager) {
        // Unpack maps
        const servicesMap = new Map(data.services || []);
        const usersMap = new Map(data.users || []);
        
        // Wait a frame so the UI can update the text
        await new Promise(r => setTimeout(r, 50));
        
        graphManager.loadData({
          nodes: data.nodes || [],
          edges: data.edges || [],
          services: servicesMap,
          users: usersMap
        });
        
        graphPlaceholder.style.display = 'none';
        
        // Re-calculate UI stats
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        const servicesCount = nodes.filter(n => n.type === 'service' || n.group === 'service').length;
        const usersCount = nodes.filter(n => n.type === 'user' || n.type === 'superuser' || n.group === 'user').length;
        
        statServices.textContent = servicesCount;
        statUsers.textContent = usersCount;
        statConnections.textContent = edges.length;
        headerStats.style.display = 'flex';

        // Apply loaded Physics State
        if (data.physics) {
          const { mode, config } = data.physics;
          document.querySelectorAll('#physics-settings-menu .mode-item').forEach(el => {
            el.classList.toggle('active', el.dataset.mode === mode);
          });
          
          if (mode === 'centralized' && config) {
            document.querySelectorAll('#physics-settings-menu .physics-item').forEach(el => el.classList.remove('active'));
            document.querySelector(`#physics-settings-menu .physics-item[data-physics="${config}"]`)?.classList.add('active');
            
            localStorage.setItem('visPhysicsConfig', config);
            localStorage.setItem('visModeConfig', 'centralized');
            graphManager.setMode('centralized'); // This will automatically pull the config
            graphManager.setPhysics(config);
          } else {
            localStorage.setItem('visModeConfig', mode);
            document.querySelectorAll('#physics-settings-menu .physics-item').forEach(el => el.classList.remove('active'));
            graphManager.setMode(mode);
          }
        } else {
           // Default fallback
           localStorage.setItem('visModeConfig', 'centralized');
           localStorage.setItem('visPhysicsConfig', 'fast');
           graphManager.setMode('centralized');
           graphManager.setPhysics('fast');
        }

        // Apply loaded Filters State
        if (data.filters && filtersManager) {
          filtersManager.activeFilters.clear();
          data.filters.forEach(f => filtersManager.activeFilters.add(f));
          // Update DOM checkboxes visually
          document.querySelectorAll('.filter-toggle input').forEach(cb => {
            if (cb.dataset.filter) {
              cb.checked = filtersManager.activeFilters.has(cb.dataset.filter);
            }
          });
          filtersManager.applyFilters();
        }
      }
    }
    
    showToast(`Project "${project.name}" v${project.version} loaded!`, 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  } finally {
    const loader = document.getElementById('initial-app-loader');
    loader.style.opacity = '0';
    exploreProgressContainer.style.display = 'none';
    setTimeout(() => { loader.style.display = 'none'; }, 400);
  }
}

// ===== Clean Everything =====
function handleCleanEverything() {
  // Clear graph
  if (graphManager) {
    graphManager.loadData({ nodes: [], edges: [], services: new Map(), users: new Map() });
  }

  // Hide stats
  headerStats.style.display = 'none';
  statServices.textContent = '0';
  statUsers.textContent = '0';
  statConnections.textContent = '0';

  // Show placeholder
  graphPlaceholder.style.display = 'flex';

  // Clear search input
  searchInput.value = '';
  autoResizeTextarea();

  // Disable AI analysis button
  btnAnalyzeUsers.disabled = true;
  btnAnalyzeUsers.classList.remove('needs-exploration');

  // Disable explore button
  btnExploreUsers.disabled = true;
  btnExploreUsers.classList.remove('running', 'blink');

  // Hide toggle exploration
  btnToggleExploration.style.display = 'none';

  // Hide identifiable filter
  filtersManager.setIdentifiableVisible(false);

  // Hide multi-domain options
  multiDomainOptions.style.display = 'none';
  if (autoConnectDomainsCheckbox) {
    autoConnectDomainsCheckbox.checked = true;
    autoConnectDomains = true;
  }

  // Reset state
  currentSearchField = 'domain';
  currentSearchTerms = [];
  usersExplored = false;
  explorationVisible = true;
  isExploring = false;
  exploreController = null;

  // Hide progress
  exploreProgressContainer.style.display = 'none';
  aiProgressContainer.style.display = 'none';

  showToast('Everything cleared', 'info');
}

// ===== File Upload =====
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (file.type !== 'text/plain') {
    showToast('Please upload a .txt file', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    // Split by lines and filter empty lines
    const lines = content.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      showToast('File is empty', 'warning');
      return;
    }

    // Append to existing content or replace if empty
    const currentContent = searchInput.value.trim();
    if (currentContent) {
      searchInput.value = currentContent + '\n' + lines.join('\n');
    } else {
      searchInput.value = lines.join('\n');
    }

    // Dispatch input event to trigger UI updates (like the multi-domain toggle)
    searchInput.dispatchEvent(new Event('input'));
    // Auto-resize textarea
    autoResizeTextarea();

    showToast(`Loaded ${lines.length} search terms from file`, 'success');
  };

  reader.onerror = () => {
    showToast('Error reading file', 'error');
  };

  reader.readAsText(file);

  // Clear file input so same file can be selected again
  fileInput.value = '';
}

function autoResizeTextarea() {
  const lines = searchInput.value.split('\n').length;
  const minHeight = 38;
  const lineHeight = 18;

  // Allow unlimited growth, but keep minimum height
  const newHeight = Math.max(minHeight, lines * lineHeight + 10);
  searchInput.style.height = newHeight + 'px';
}

// ===== Node Selection =====
function handleNodeSelect(nodeId, nodeData) {
  if (!nodeData) return;

  nodeActionsSection.style.display = 'block';

  // Build info panel
  const rows = [];
  rows.push(infoRow('Type', nodeData.type));

  if (nodeData.type === 'domain') {
    rows.push(infoRow('Domain', nodeData.label));
    const domainCount = graphManager.allNodesData.filter((n) => n.type === 'domain').length;
    if (domainCount > 1) {
      rows.push(infoRow('Total Domains', domainCount));
    }
  } else if (nodeData.type === 'user') {
    // Check if user has direct connection to any domain
    const hasDirectConnection = graphManager.allEdgesData.some(edge =>
      edge.to === nodeData.id && edge.type === 'direct-org-user'
    );

    if (hasDirectConnection && nodeData.isOrgEmail) {
      rows.push(infoRow('Direct Connection', '✓ Yes', 'color: #00e676;'));
    }

    if (nodeData.email) {
      if (nodeData.email.includes('@')) {
        rows.push(infoRow('Email', nodeData.email));
      } else {
        rows.push(infoRow('Email', 'none', 'color: var(--text-muted); font-style: italic;'));
      }
    } else {
      rows.push(infoRow('Email', 'none', 'color: var(--text-muted); font-style: italic;'));
    }
    rows.push(infoRow('Hostname', nodeData.hostname || nodeData.label));
    if (nodeData.sourceType) {
      rows.push(infoRow('Type', nodeData.sourceType === 'stealer' ? 'Infostealer' : 'Breach'));
    }
    if (nodeData.isLinkedToDomain !== undefined) {
      const linkedStatus = nodeData.isLinkedToDomain ? '✓ Yes' : '✗ No';
      const linkedStyle = nodeData.isLinkedToDomain ? 'color: #00e676;' : 'color: #94a3b8;';
      rows.push(infoRow('Linked', linkedStatus, linkedStyle));
    }
    if (nodeData.usersCount !== undefined) rows.push(infoRow('Users', nodeData.usersCount));
    if (nodeData.credentialsFound) rows.push(infoRow('Credentials', nodeData.credentialsFound));

    // Show exploration status
    if (nodeData._explored) {
      rows.push(infoRow('Explored', '✓ Yes', 'color: #00e676;'));
    }

    // AI Analysis Results
    if (nodeData.identifiable !== null && nodeData.identifiable !== undefined) {
      const identifiableStatus = nodeData.identifiable ? '✓ Yes' : '✗ No';
      const statusStyle = nodeData.identifiable ? 'color: #ffab00;' : 'color: #64748b;';
      rows.push(infoRow('Identifiable', identifiableStatus, statusStyle));

      // Show detailed reasons if identifiable
      if (nodeData.identifiable && nodeData.identifiableReasons) {
        rows.push(infoRow('Reasons', nodeData.identifiableReasons.join(', '), 'font-size: 10px;'));
      }
    }
    if (nodeData.deleted) {
      rows.push(infoRow('Status', '⚠ Deleted'));
    }

    // Show Email Context from fulldata/domain API
    if (nodeData.emailContexts && nodeData.emailContexts.length > 0) {
      const contextParts = [];
      for (const ctx of nodeData.emailContexts) {
        try {
          const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
          const fields = [];
          if (parsed.firstname) fields.push(`Name: ${parsed.firstname} ${parsed.lastname || ''}`.trim());
          if (parsed.phone) fields.push(`Phone: ${parsed.phone}`);
          if (parsed.mobile) fields.push(`Mobile: ${parsed.mobile}`);
          if (parsed.city) fields.push(`City: ${parsed.city}`);
          if (parsed.country) fields.push(`Country: ${parsed.country}`);
          if (parsed.state) fields.push(`State: ${parsed.state}`);
          if (parsed.zip) fields.push(`Zip: ${parsed.zip}`);
          if (parsed.dob) fields.push(`DoB: ${parsed.dob}`);
          if (parsed.fax) fields.push(`Fax: ${parsed.fax}`);
          if (fields.length > 0) {
            contextParts.push(fields.join(' | '));
          } else {
            // Show raw context fully without truncation
            contextParts.push(ctx);
          }
        } catch (e) {
          // Not valid JSON, show raw fully
          contextParts.push(ctx);
        }
      }
      if (contextParts.length > 0) {
        const contextValue = contextParts.join('<br>---<br>');
        rows.push(infoRow('Email Context', contextValue, 'font-size: 10px; word-break: break-all;'));
      }
    }

    // Show exploration data details
    if (nodeData._explorationData) {
      const ed = nodeData._explorationData;

      // Cookie List
      if (ed.cookies && ed.cookies.length > 0) {
        const cookieList = ed.cookies.slice(0, 30).join(', ');
        const more = ed.cookies.length > 30 ? ` ... +${ed.cookies.length - 30} more` : '';
        rows.push(infoRow('Cookie List', `${ed.cookies.length} domains<br><span style="font-size:9px;color:#94a3b8;">${cookieList}${more}</span>`, 'font-size: 10px; word-break: break-all;'));
      }

      // Credentials
      if (ed.credentials && ed.credentials.length > 0) {
        const credLines = ed.credentials.slice(0, 15).map(c => {
          const url = c.URL || c.url || '?';
          const user = c.USER || c.user || c.username || '?';
          return `${user} @ ${url}`;
        }).join('<br>');
        const more = ed.credentials.length > 15 ? `<br>... +${ed.credentials.length - 15} more` : '';
        rows.push(infoRow('Credentials', `${ed.credentials.length} entries<br><span style="font-size:9px;color:#94a3b8;">${credLines}${more}</span>`, 'font-size: 10px; word-break: break-all;'));
      }

      if (ed.ftpInfo) rows.push(infoRow('FTP', ed.ftpInfo, 'color: #00e676; font-size: 10px;'));
      if (ed.country) rows.push(infoRow('Country', ed.country));
      if (ed.logDate) rows.push(infoRow('Log Date', ed.logDate));
      if (ed.hwid) rows.push(infoRow('HWID', ed.hwid, 'font-size: 10px; word-break: break-all;'));
    }

    // AI Identification result
    if (nodeData.aiAnalysis) {
      const ai = nodeData.aiAnalysis;
      const statusIcon = ai.identifiable ? '✓' : '✗';
      const statusColor = ai.identifiable ? '#00e676' : '#64748b';
      const statusText = ai.identifiable ? 'Identifiable' : 'Not Identifiable';
      let aiHtml = `<span style="color:${statusColor};font-weight:bold;">${statusIcon} ${statusText}</span>`;
      if (ai.reasons && ai.reasons.length > 0) {
        aiHtml += '<br><span style="font-size:9px;color:#94a3b8;">Reasons:<br>' + ai.reasons.map(r => `• ${r}`).join('<br>') + '</span>';
      }
      if (ai.evidence && ai.evidence.length > 0) {
        aiHtml += '<br><span style="font-size:9px;color:#ffab00;">Evidence:<br>' + ai.evidence.map(e => `◦ ${e}`).join('<br>') + '</span>';
      }
      rows.push(infoRow('AI Identification', aiHtml, 'font-size: 10px; word-break: break-all;'));
    }
  } else if (nodeData.type === 'service') {
    rows.push(infoRow('Hostname', nodeData.hostname || nodeData.label));
    if (nodeData.sourceType) {
      rows.push(infoRow('Type', nodeData.sourceType === 'stealer' ? 'Infostealer' : 'Breach'));
    }
    if (nodeData.usersCount !== undefined) rows.push(infoRow('Users', nodeData.usersCount));
    if (nodeData.credentialsFound) rows.push(infoRow('Credentials', nodeData.credentialsFound));
  }

  nodeInfoPanel.innerHTML = rows.join('');

  // Show/hide action buttons based on node type
  btnDeleteNode.style.display = nodeData.type !== 'domain' ? 'flex' : 'none';
  btnConnectUsers.style.display = nodeData.type === 'user' && !nodeData.deleted ? 'flex' : 'none';
  btnConnectDomains.style.display = nodeData.type === 'domain' ? 'flex' : 'none';
}

function handleNodeDeselect() {
  nodeActionsSection.style.display = 'none';
  nodeInfoPanel.innerHTML = '';
}

function infoRow(key, value, valueStyle = '') {
  const styleAttr = valueStyle ? ` style="${valueStyle}"` : '';
  return `<div class="node-info-row">
    <span class="node-info-key">${key}</span>
    <span class="node-info-value"${styleAttr}>${value}</span>
  </div>`;
}

// ===== Node Actions =====
function handleDeleteNode() {
  if (!graphManager.selectedNodeId) return;
  const nodeData = graphManager._getNodeData(graphManager.selectedNodeId);
  graphManager.deleteNode(graphManager.selectedNodeId);

  // Update stats
  const stats = graphManager.getStats();
  statUsers.textContent = stats.users;
  statConnections.textContent = stats.connections;

  showToast(`Node "${nodeData?.label || 'unknown'}" deleted`, 'info');
}

function handleConnectUsers() {
  if (!graphManager.selectedNodeId) return;
  const success = graphManager.enterConnectionMode(graphManager.selectedNodeId);
  if (success) {
    showToast('Connection mode: click another user node to connect', 'info');
  }
}

function handleConnectDomains() {
  if (!graphManager.selectedNodeId) return;
  const success = graphManager.enterConnectionMode(graphManager.selectedNodeId);
  if (success) {
    showToast('Connection mode: click another domain node to link', 'info');
  }
}

// ===== Filters =====
function handleFiltersChange(filterState) {
  if (!graphManager) return;
  graphManager.applyFilters(filterState);

  // Update stats
  const stats = graphManager.getStats();
  statServices.textContent = stats.services;
  statUsers.textContent = stats.users;
  statConnections.textContent = stats.connections;

  // Re-apply the current layout algorithm to gracefully collapse/expand filtered nodes
  if (graphManager.layoutMode) {
    graphManager.setMode(graphManager.layoutMode);
  }
}

// ===== Explore All Users Data =====
async function handleExploreAllUsersData() {
  if (isExploring) {
    console.warn('[Explore] isExploring is already true. Bailing.');
    return;
  }
  isExploring = true;
  exploreController = { aborted: false, paused: false };

  btnExploreUsers.disabled = true;
  btnExploreUsers.classList.add('running');

  // Reset filters before exploring
  filtersManager.reset();
  handleFiltersChange(filtersManager.getState());

  const userNodes = graphManager.getUserNodes();
  if (userNodes.length === 0) {
    showToast('No users to explore', 'warning');
    isExploring = false;
    exploreController = null;
    btnExploreUsers.disabled = false;
    btnExploreUsers.classList.remove('running');
    return;
  }

  // Step 1: Collect all unique HWIDs/filenames across all user nodes
  const hwidToUsers = new Map(); // hwid_filename -> Set of userKeys
  const userIdToKeys = new Map(); // userId -> Set of userKeys (emails/usernames)
  const allHwids = new Set();

  for (const user of userNodes) {
    if (!user.hwids || user.hwids.length === 0) continue;
    const userKeys = new Set();
    if (user.email) userKeys.add(user.email.toLowerCase());
    if (user.username) userKeys.add(user.username.toLowerCase());
    userIdToKeys.set(user.id, userKeys);

    for (const { filename } of user.hwids) {
      if (!filename) continue;
      allHwids.add(filename);
      if (!hwidToUsers.has(filename)) hwidToUsers.set(filename, new Set());
      hwidToUsers.get(filename).add(user.id);
    }
  }

  if (allHwids.size === 0) {
    showToast('No users with HWID found. Building isolated superusers...', 'info');
  }

  // Show progress
  const totalHwids = allHwids.size;
  if (totalHwids > 0) {
    exploreProgressContainer.style.display = 'block';
    exploreControls.style.display = 'flex';
    btnStopExplore.disabled = false;
    btnKillExplore.disabled = false;

    exploreProgressBar.style.width = '0%';
    exploreProgressCount.textContent = `0 / ${totalHwids}`;
    exploreProgressLabel.textContent = 'Exploring HWIDs...';
  }

  loadingOverlay.style.display = 'flex';
  loadingText.textContent = totalHwids > 0 ? `Starting exploration of ${totalHwids} unique HWIDs...` : 'Building isolated superusers...';

  if (totalHwids > 0) showToast(`Starting exploration of ${totalHwids} unique HWIDs...`, 'info');

  // Step 2: Fetch data for each unique HWID
  const hwidData = new Map(); // hwid_filename -> array of records
  let processed = 0;

  for (const filename of allHwids) {
    if (exploreController.aborted) {
      showToast('Exploration stopped by user. Building partial superusers...', 'warning');
      break;
    }

    if (exploreController.paused) {
      exploreProgressLabel.textContent = 'Exploration Paused. Waiting to resume...';
      btnStopExplore.innerHTML = '<i class="fas fa-play"></i> Play';
      btnStopExplore.classList.remove('danger');
      btnStopExplore.classList.add('success');

      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (!exploreController.paused || exploreController.aborted) {
            clearInterval(interval);
            resolve();
          }
        }, 200);
      });

      if (!exploreController.aborted) {
        btnStopExplore.innerHTML = '<i class="fas fa-stop"></i> Stop';
        btnStopExplore.classList.add('danger');
        btnStopExplore.classList.remove('success');
      } else {
        showToast('Exploration stopped by user. Building partial superusers...', 'warning');
        break;
      }
    }

    try {
      exploreProgressLabel.textContent = `Exploring: ${filename.slice(0, 40)}...`;
      const dataArray = [];
      for await (const batch of searchFullStealerFilename(filename)) {
        dataArray.push(...batch);
      }
      hwidData.set(filename, dataArray);
    } catch (e) {
      console.warn(`[Explore] Failed for ${filename}:`, e.message);
    }

    processed++;
    const pct = Math.round((processed / totalHwids) * 100);
    exploreProgressBar.style.width = `${pct}%`;
    exploreProgressCount.textContent = `${processed} / ${totalHwids}`;
    loadingText.textContent = `Fetching and parsing ${processed} of ${totalHwids} HWIDs... (${pct}%)`;

    if (processed < totalHwids) await sleep(200);
  }

  // Early break logic hiding components sequentially
  if (hwidData.size === 0 && exploreController?.aborted) {
    isExploring = false;
    exploreController = null;
    btnExploreUsers.classList.remove('running');
    btnExploreUsers.disabled = false;
    exploreProgressLabel.textContent = 'Exploration aborted with no data.';
    exploreControls.style.display = 'none';
    loadingOverlay.style.display = 'none';
    btnStopExplore.innerHTML = '<i class="fas fa-stop"></i> Stop';
    btnStopExplore.classList.remove('success', 'danger');
    updateAIButtonState();
    return;
  } else if (hwidData.size === 0 && totalHwids > 0) {
    showToast('No stealer data returned for HWIDs. Falling back to isolated superusers.', 'info');
  }

  // Step 3: Build superuser groups by merging HWIDs that share users
  // Union-Find style: if HWID-A and HWID-B share a user, merge them
  exploreProgressLabel.textContent = 'Building superusers...';

  const userToGroup = new Map(); // userId -> groupId
  const groups = new Map(); // groupId -> { userIds: Set, hwids: Set }
  let groupCounter = 0;

  // Pre-seed with existing superusers so HWID overlaps cleanly merge into them
  const existingSuperusers = graphManager.getSuperuserNodes();
  for (const su of existingSuperusers) {
    groups.set(su.id, {
      userIds: new Set(su.linkedUserIds || []),
      hwids: new Set(su.allHwids || []),
      isExisting: true
    });
    for (const uid of (su.linkedUserIds || [])) {
      userToGroup.set(uid, su.id);
    }
  }

  for (const [filename, userIds] of hwidToUsers) {
    // Find existing groups for these users
    const existingGroups = new Set();
    for (const uid of userIds) {
      if (userToGroup.has(uid)) {
        existingGroups.add(userToGroup.get(uid));
      }
    }

    let targetGroupId;
    if (existingGroups.size > 0) {
      // Merge into first existing group
      const groupIds = Array.from(existingGroups);
      targetGroupId = groupIds[0];

      // Merge other groups into this one
      for (let i = 1; i < groupIds.length; i++) {
        const otherGroup = groups.get(groupIds[i]);
        if (otherGroup) {
          for (const uid of otherGroup.userIds) {
            groups.get(targetGroupId).userIds.add(uid);
            userToGroup.set(uid, targetGroupId);
          }
          for (const hwid of otherGroup.hwids) {
            groups.get(targetGroupId).hwids.add(hwid);
          }
          groups.delete(groupIds[i]);
        }
      }
    } else {
      // Find matches against an existing superuser based on matching HWIDs in the current batch
      let matchedGroupId = null;
      for (const [eGroupId, eGroup] of groups) {
        if (eGroup.hwids.has(filename)) {
          matchedGroupId = eGroupId;
          break;
        }
      }

      if (matchedGroupId) {
        targetGroupId = matchedGroupId;
      } else {
        // New group
        targetGroupId = `superuser_${Date.now()}_${groupCounter++}`;
        groups.set(targetGroupId, { userIds: new Set(), hwids: new Set() });
      }
    }

    // Add users and HWID to group
    const group = groups.get(targetGroupId);
    for (const uid of userIds) {
      group.userIds.add(uid);
      userToGroup.set(uid, targetGroupId);
    }
    group.hwids.add(filename);
  }

  // Step 4: Create superuser nodes for each group
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = 'Building superuser nodes...';
  let superuserCount = 0;
  const batchNewNodes = [];
  const batchNewEdges = [];
  for (const [groupId, group] of groups) {
    // Aggregate all data from all HWIDs in this group
    const superuserData = {
      cookies: [],
      credentials: [],
      ftpInfo: null,
      country: null,
      logDate: null,
      allHwids: Array.from(group.hwids),
      searchTerms: [],
      rawRecords: [],
      wallets: [],
    };

    for (const filename of group.hwids) {
      const records = hwidData.get(filename) || [];
      for (const record of records) {
        const source = record._source || record;
        superuserData.rawRecords.push(source);

        // Cookies
        if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
          for (const cookieDomain of source['Cookie list']) {
            const clean = cookieDomain.trim();
            if (!clean || clean.length < 3) continue;
            if (/^[a-z]{20,}$/.test(clean)) continue;
            if (!superuserData.cookies.includes(clean)) {
              superuserData.cookies.push(clean);
            }
          }
        }

        // Credentials
        if (source['Credentials'] && Array.isArray(source['Credentials'])) {
          for (const cred of source['Credentials']) {
            superuserData.credentials.push(cred);
          }
        }

        // FTP
        if (source['FTP info'] && source['FTP info'].trim()) {
          superuserData.ftpInfo = source['FTP info'];
        }

        // VPN & Telegram
        if (source['VPN info'] && source['VPN info'].trim()) superuserData.vpnInfo = source['VPN info'];
        if (source['Telegram Data'] && source['Telegram Data'].trim()) superuserData.telegramData = source['Telegram Data'];
        if (source['Telegram ID'] && source['Telegram ID'].trim()) superuserData.telegramId = source['Telegram ID'];
        if (source['Telegram Phone'] && source['Telegram Phone'].trim()) superuserData.telegramPhone = source['Telegram Phone'];
        if (source['Telegram chats'] && source['Telegram chats'].trim()) superuserData.telegramChats = source['Telegram chats'];
        if (source['Telegram groups'] && source['Telegram groups'].trim()) superuserData.telegramGroups = source['Telegram groups'];

        // Wallets (format: "Provider:Address" or "Provider:Address,Provider2:Address2")
        if (source['wallets'] && source['wallets'].trim()) {
          const walletEntries = source['wallets'].split(',').map(w => w.trim()).filter(Boolean);
          for (const entry of walletEntries) {
            const colonIdx = entry.indexOf(':');
            if (colonIdx > 0) {
              const provider = entry.substring(0, colonIdx).trim();
              const address = entry.substring(colonIdx + 1).trim();
              if (address && !superuserData.wallets.find(w => w.address === address)) {
                superuserData.wallets.push({ provider, address });
              }
            }
          }
        }

        // Country / HWID / Log date
        if (source['Country']) {
          const rawC = source['Country'].trim();
          const twoLetter = rawC.match(/^([A-Za-z]{2})\b/);
          if (twoLetter) {
            superuserData.country = twoLetter[1].toUpperCase();
          } else {
            superuserData.country = rawC.replace(/-\s*[\d\.:a-fA-F]+/g, '').replace(/[\d\.:a-fA-F]+/g, '').trim().toUpperCase();
          }
        }
        if (source['Log date']) superuserData.logDate = source['Log date'];

        // search_term
        if (source.search_term && !superuserData.searchTerms.includes(source.search_term)) {
          superuserData.searchTerms.push(source.search_term);
        }
      }
    }

    // Determine if this is an org-linked superuser
    const linkedUserIds = Array.from(group.userIds);
    const isOrgSuperuser = linkedUserIds.some(uid => {
      const userNode = graphManager.getUserNodeById(uid);
      return userNode && userNode.isOrgEmail;
    });

    // Collect emails and emailContexts from all linked users for the superuser summary
    const linkedEmails = [];
    const aggregatedContexts = [];
    for (const uid of linkedUserIds) {
      const userNode = graphManager.getUserNodeById(uid);
      if (userNode) {
        if (userNode.email) linkedEmails.push(userNode.email);
        if (userNode.emailContexts && Array.isArray(userNode.emailContexts)) {
          aggregatedContexts.push(...userNode.emailContexts);
        }

        // Fallback user name/username extraction from Telegram chats header
        if (superuserData.telegramChats && !superuserData.telegramChats.startsWith('ID ')) {
          const profileMatch = superuserData.telegramChats.match(/^(.*?)\s+Username\s+(.*?)\s+Phone/i);
          if (profileMatch) {
            const extractedName = profileMatch[1].trim();
            const extractedUser = profileMatch[2].trim();
            let needsUpdate = false;
            if ((!userNode.name || userNode.name === 'None') && extractedName && extractedName !== 'C' && extractedName !== 'Sq') {
              userNode.name = extractedName;
              needsUpdate = true;
            }
            if ((!userNode.username || userNode.username === 'None') && extractedUser && extractedUser !== 'None') {
              userNode.username = extractedUser;
              needsUpdate = true;
            }
            if (needsUpdate) {
              if (userNode.email && userNode.name) userNode.label = `${userNode.name}\\n${userNode.email}`;
              try { graphManager.nodesDataset.update(graphManager._toVisNode(userNode)); } catch (e) { }
            }
          }
        }
      }
    }

    if (group.isExisting) {
      // Merge new data into existing superuser
      const suNode = graphManager.getSuperuserNodeById(groupId);
      if (suNode) {
        // Find users that are completely new to this existing superuser link
        const newlyLinkedUsers = linkedUserIds.filter(uid => !suNode.linkedUserIds.includes(uid));

        suNode.explorationData.cookies = [...new Set([...(suNode.explorationData.cookies || []), ...superuserData.cookies])];
        suNode.explorationData.credentials = [...(suNode.explorationData.credentials || []), ...superuserData.credentials]; // We could dedup
        suNode.explorationData.rawRecords = [...(suNode.explorationData.rawRecords || []), ...superuserData.rawRecords];
        suNode.explorationData.allHwids = Array.from(group.hwids);
        suNode.allHwids = Array.from(group.hwids);

        if (!suNode.country && superuserData.country) suNode.country = superuserData.country;

        suNode.linkedUserIds = linkedUserIds;
        suNode.linkedEmails = linkedEmails;
        if (!suNode.emailContexts) suNode.emailContexts = [];
        suNode.emailContexts = [...new Set([...suNode.emailContexts, ...aggregatedContexts])];

        // Refresh vis node
        try {
          graphManager.nodesDataset.update(graphManager._toVisNode(suNode));
        } catch (e) { }

        // Connect completely new users that were merged
        for (const uid of newlyLinkedUsers) {
          graphManager.addEdge({
            from: groupId,
            to: uid,
            type: 'superuser-user',
          }, true);

          const userNode = graphManager.getUserNodeById(uid);
          if (userNode) {
            userNode._explored = true;
            userNode._superuserId = groupId;
            userNode._explorationData = suNode.explorationData;
            graphManager.setUserExplored(uid);
          }
        }
      }
    } else {
      // Create fresh superuser node
      const superuserNode = {
        id: groupId,
        type: 'superuser',
        label: `Superuser (${linkedUserIds.length})`,
        isOrgSuperuser,
        linkedUserIds,
        linkedEmails,
        allHwids: superuserData.allHwids,
        explorationData: superuserData,
        emailContexts: aggregatedContexts,
        country: superuserData.country,
        aiAnalysis: null,
      };

      batchNewNodes.push(superuserNode);

      // Create edges from superuser to each linked user
      for (const uid of linkedUserIds) {
        batchNewEdges.push({
          from: groupId,
          to: uid,
          type: 'superuser-user',
        });

        // Mark user as explored and store exploration data reference
        const userNode = graphManager.getUserNodeById(uid);
        if (userNode) {
          userNode._explored = true;
          userNode._superuserId = groupId;
          userNode._explorationData = superuserData;
          graphManager.setUserExplored(uid);
        }
      }
      superuserCount++;
    }
  }

  // Step 5: Match non-HWID users to existing superusers by username/email overlap
  exploreProgressLabel.textContent = 'Matching non-HWID users...';
  const nonHwidUsers = userNodes.filter(u => (!u.hwids || u.hwids.length === 0) && !graphManager.isUserExplored(u.id));

  for (const user of nonHwidUsers) {
    const userEmail = (user.email || '').toLowerCase();
    const userName = (user.username || '').toLowerCase();

    // Check if this user's email/username appears in any superuser's credentials
    for (const [groupId, group] of groups) {
      let matched = false;
      for (const filename of group.hwids) {
        const records = hwidData.get(filename) || [];
        for (const record of records) {
          const source = record._source || record;
          if (source['Credentials'] && Array.isArray(source['Credentials'])) {
            for (const cred of source['Credentials']) {
              const credUser = (cred.USER || cred.user || '').toLowerCase();
              if (credUser && (credUser === userEmail || credUser === userName)) {
                matched = true;
                break;
              }
            }
          }
          if (matched) break;
        }
        if (matched) break;
      }

      if (matched) {
        // Connect user to the superuser
        graphManager.addEdge({
          from: groupId,
          to: user.id,
          type: 'superuser-user',
        }, true);

        // Update superuser node's linkedUserIds
        const superuserNode = graphManager.getSuperuserNodeById(groupId);
        if (superuserNode && !superuserNode.linkedUserIds.includes(user.id)) {
          superuserNode.linkedUserIds.push(user.id);
          if (user.email) superuserNode.linkedEmails.push(user.email);
          // Refresh vis node
          try {
            graphManager.nodesDataset.update(graphManager._toVisNode(superuserNode));
          } catch (e) { /* ignore */ }
        }

        user._explored = true;
        user._superuserId = groupId;
        user._explorationData = superuserNode.explorationData;
        graphManager.setUserExplored(user.id);
        break; // Only connect to first matching superuser
      }
    }
  }

  // Step 6: Create 1:1 superusers for remaining unexplored users
  exploreProgressLabel.textContent = 'Creating isolated superusers...';
  let newNodes = [];
  let newEdges = [];
  const remainingUnexplored = userNodes.filter(u => !graphManager.isUserExplored(u.id));

  for (const user of remainingUnexplored) {
    const groupId = `superuser_${Date.now()}_iso_${user.id}`;
    const superuserData = {
      cookies: [],
      credentials: [],
      ftpInfo: null,
      country: user.country || null,
      logDate: null,
      allHwids: [],
      searchTerms: [],
      rawRecords: [],
    };

    const superuserNode = {
      id: groupId,
      type: 'superuser',
      label: `Superuser (1)`,
      isOrgSuperuser: !!user.isOrgEmail,
      linkedUserIds: [user.id],
      linkedEmails: user.email ? [user.email] : [],
      allHwids: [],
      explorationData: superuserData,
      country: superuserData.country,
      aiAnalysis: null,
    };

    newNodes.push(superuserNode);
    newEdges.push({
      from: groupId,
      to: user.id,
      type: 'superuser-user',
    });

    user._explored = true;
    user._superuserId = groupId;
    user._explorationData = superuserData;
    graphManager.setUserExplored(user.id);
  }

  // Combine all batch nodes (superusers from Step 4 + isolated superusers from Step 6)
  const finalNodes = [...batchNewNodes, ...newNodes];
  let finalEdges = [...batchNewEdges, ...newEdges];
  const edgesToDelete = [];

  // Rewire incoming domain/service edges from User -> Superuser
  for (const suNode of finalNodes) {
    if (!suNode.linkedUserIds || suNode.linkedUserIds.length === 0) continue;

    for (const uid of suNode.linkedUserIds) {
      // Find all incoming connection edges to this user
      const incomingEdges = graphManager.edgesDataset.get({
        filter: e => e.to === uid && e._data &&
          (e._data.type === 'direct-org-user' || e._data.type === 'domain-user' || e._data.type === 'service-user')
      });

      for (const edge of incomingEdges) {
        edgesToDelete.push(edge.id);
        const origEdge = edge._data;

        // Recreate the edge pointing to the Superuser instead
        // Check if an identical edge already exists in finalEdges or network to avoid duplicates
        const alreadyRecreated = finalEdges.some(fe => fe.from === origEdge.from && fe.to === suNode.id && fe.type === origEdge.type) ||
          graphManager.edgesDataset.get({ filter: ge => ge.from === origEdge.from && ge.to === suNode.id && ge._data && ge._data.type === origEdge.type && !edgesToDelete.includes(ge.id) }).length > 0;

        if (!alreadyRecreated) {
          finalEdges.push({
            from: origEdge.from,
            to: suNode.id,
            type: origEdge.type,
            dashes: origEdge.dashes || false
          });
        }
      }
    }
  }

  if (edgesToDelete.length > 0) {
    graphManager.deleteEdges(edgesToDelete);
  }

  if (finalNodes.length > 0 || finalEdges.length > 0) {
    loadingText.textContent = `Rendering ${finalNodes.length} nodes...`;
    await sleep(50);
    graphManager.batchAdd(finalNodes, finalEdges);
    // Restore layout mode after batch add to prevent reset to circular
    if (graphManager && graphManager.layoutMode) {
      graphManager.setMode(graphManager.layoutMode);
    }
  }

  // Hide loading overlay
  loadingOverlay.style.display = 'none';

  // Done
  usersExplored = true;
  isExploring = false;
  exploreController = null;
  btnExploreUsers.classList.remove('running');
  btnExploreUsers.disabled = false;
  exploreProgressLabel.textContent = 'Exploration complete!';
  exploreControls.style.display = 'none';
  btnStopExplore.innerHTML = '<i class="fas fa-stop"></i> Stop';
  btnStopExplore.classList.remove('success', 'danger');

  // Update button states
  updateAIButtonState();

  // Apply current filters to show superuser nodes
  graphManager.applyFilters(filtersManager.getState());
  populateCountryFilter(graphManager.allNodesData);

  // Update stats
  const stats = graphManager.getStats();
  statServices.textContent = stats.services;
  statUsers.textContent = stats.users;
  statConnections.textContent = stats.connections;

  showToast(`Exploration complete: ${superuserCount} superusers created from ${totalHwids} HWIDs`, 'success');

  // Re-apply physical layout after huge node addition batch
  if (graphManager && graphManager.layoutMode) {
    graphManager.setMode(graphManager.layoutMode);
  }
}

/**
 * Handle Pre-Identify OSINT Process natively after Exploration 
 */
async function handlePreidentifyAllUsers() {
  if (aiRunning || isExploring) return;
  aiRunning = true; // Use global locks protecting node states

  // Filter out any superusers that already have an ongoing or completed AI Analysis
  const superusers = graphManager.allNodesData.filter(n => n.type === 'superuser' && n.explorationData && n.explorationData.rawRecords && !n.aiAnalysis);
  const total = superusers.length;

  if (total === 0) {
    showToast('No superusers found to preidentify.', 'warning');
    aiRunning = false;
    return;
  }

  // Reuse explore progress UI natively
  exploreProgressContainer.style.display = 'block';
  exploreControls.style.display = 'none';
  exploreProgressLabel.textContent = 'Preidentifying Users...';
  exploreProgressBar.style.width = '0%';
  exploreProgressCount.textContent = `0 / ${total}`;
  btnPreidentifyUsers.disabled = true;
  btnPreidentifyUsers.classList.add('running');
  btnPreidentifyUsers.innerHTML = `
    <div style="width:14px;height:14px;border:2px solid;border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;"></div>
    <span>Preidentifying...</span>
  `;

  let processed = 0;

  for (const superuserNode of superusers) {
    const groupId = superuserNode.id;

    // Trigger visual analysis indicator
    graphManager.startNodeBlink(groupId);
    await new Promise(r => setTimeout(r, 30)); // Delay for visuals

    const result = performLocalPreAnalysis(superuserNode.explorationData.rawRecords, superuserNode.country, superuserNode.emailContexts);

    // Apply inferred country natively updating dataset rendering
    if (result.inferredCountry && !superuserNode.country) {
      superuserNode.country = result.inferredCountry;
      superuserNode.explorationData.country = result.inferredCountry;
      try {
        graphManager.nodesDataset.update(graphManager._toVisNode(superuserNode));
      } catch (e) { /* ignore */ }
    }

    // Build reasons based on extraction
    const reasons = [];
    const countryText = result.inferredCountry || superuserNode.country || 'Unknown country';
    const socialsText = result.socials.length > 0 ? `${result.socials.length} social accounts` : 'no social accounts';
    const phoneText = result.phone ? 'has phone' : 'no phone';

    const prefix = countryText.length === 2 ? 'Country ' : '';
    reasons.push(`Preanalysis result: ${result.status}.<br>Reasons: ${prefix}${countryText}, ${socialsText}, ${phoneText}.`);

    if (result.phone) reasons.push(`Has phone number: Yes - ${result.phone}`);
    if (result.socials.length > 0) {
      reasons.push(`Has social accounts: Yes (${result.socials.length})`);
      result.socials.forEach((s, idx) => {
        reasons.push(`Platform ${idx + 1} ${s.platform} - User: ${s.user} - Pass: ${s.pass}`);
      });
    }

    const isIdentifiable = result.status === 'Very Identifiable';
    const isPossible = result.status === 'Possible Identifiable';

    superuserNode.aiAnalysis = {
      identifiable: isIdentifiable,
      possibleIdentifiable: isPossible,
      reasons: reasons,
      evidence: [],
      _cryptoWallets: result.cryptoWallets || []
    };

    graphManager.setSuperuserIdentifiable(groupId, isIdentifiable, isPossible);

    for (const uid of superuserNode.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (result.inferredCountry && !u.country) u.country = result.inferredCountry;
        u.aiAnalysis = JSON.parse(JSON.stringify(superuserNode.aiAnalysis));
        graphManager.setUserIdentifiable(uid, isIdentifiable, reasons, isPossible);
      }
    }

    graphManager.stopNodeBlink(groupId);
    processed++;
    const pct = Math.round((processed / total) * 100);
    exploreProgressBar.style.width = `${pct}%`;
    exploreProgressCount.textContent = `${processed} / ${total}`;
  }

  // Done Formatting
  usersPreidentified = true;
  aiRunning = false;
  btnPreidentifyUsers.classList.remove('running');
  btnPreidentifyUsers.disabled = true; // Complete, no longer needed
  exploreProgressLabel.textContent = 'Preidentification complete!';

  // Enable the amplify button here
  if (btnAmplifyUsers) {
    btnAmplifyUsers.disabled = false;
  }

  btnPreidentifyUsers.innerHTML = `
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M10 4v4m0 4v4M6 10h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
    </svg>
    Preidentify all users
  `;

  updateAIButtonState();
  populateCountryFilter(graphManager.allNodesData);
  setTimeout(() => { exploreProgressContainer.style.display = 'none'; }, 3000);

  // Re-apply physical layout after processing
  if (graphManager && graphManager.layoutMode) {
    graphManager.setMode(graphManager.layoutMode);
  }
}

/**
 * Amplifies non-identifiable users using the OSINT API backend
 */
async function handleAmplifyUsers() {
  if (aiRunning) return;
  aiRunning = true;

  const amplifyProgressLabel = document.getElementById('amplify-progress-label');
  const exploreProgressContainer = document.getElementById('explore-progress-container');
  const exploreProgressBar = document.getElementById('explore-progress-bar');
  const exploreProgressCount = document.getElementById('explore-progress-count');
  const exploreProgressLabel = document.getElementById('explore-progress-label');

  btnAmplifyUsers.disabled = true;
  btnAmplifyUsers.classList.add('running');
  btnAmplifyUsers.innerHTML = `
    <svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-opacity="0.3"></circle>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
    </svg>
    Amplifying users...
  `;

  if (amplifyProgressLabel) {
    amplifyProgressLabel.style.display = 'block';
    amplifyProgressLabel.textContent = 'Starting amplification...';
  }
  floatingAnalysisStatus.style.display = 'flex';
  floatingAnalysisText.textContent = 'Amplifying non-identifiable users...';

  exploreProgressContainer.style.display = 'block';
  exploreProgressLabel.textContent = 'Seeking non-identifiable superusers...';
  exploreProgressBar.style.width = '0%';
  exploreProgressCount.textContent = '0 / 0';

  const superusersToAmplify = [];

  // 1. Localizar superusuarios en naranja o gris
  for (const node of graphManager.allNodesData) {
    if (node.type === 'superuser') {
      const isOrange = node.aiAnalysis?.possibleIdentifiable;
      const isGreen = node.aiAnalysis?.identifiable;
      if (!isGreen) { // Naranja o gris
        superusersToAmplify.push(node);
      }
    }
  }

  if (superusersToAmplify.length === 0) {
    showToast('No superusers found that need amplification.', 'info');
    btnAmplifyUsers.classList.remove('running');
    btnAmplifyUsers.disabled = false;
    btnAmplifyUsers.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 3a7 7 0 0 0-7 7c0 3.86 3.14 7 7 7s7-3.14 7-7a7 7 0 0 0-7-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="currentColor"/>
        <path d="M14 6l-2 2M6 6l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Amplify non identifiable users
    `;
    exploreProgressContainer.style.display = 'none';
    if (amplifyProgressLabel) amplifyProgressLabel.style.display = 'none';
    floatingAnalysisStatus.style.display = 'none';
    aiRunning = false;
    return;
  }

  const total = superusersToAmplify.length;
  let processed = 0;

  for (const suNode of superusersToAmplify) {
    const groupId = suNode.id;
    if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId}...`;
    floatingAnalysisText.textContent = `Amplifying OSINT: SU ${groupId} (${processed}/${total})`;
    graphManager.startNodeBlink(groupId, '#00C8FF'); // Distinctive color for amplification

    const uniqueUsernames = new Set();
    const uniqueEmails = new Set();
    const existingServices = new Set();
    const rawRecords = [];

    for (const uid of suNode.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u && u._explorationData && u._explorationData.rawRecords) {
        rawRecords.push(...u._explorationData.rawRecords);
        for (const record of u._explorationData.rawRecords) {
          const source = record._source || record;

          if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
            source['Cookie list'].forEach(c => {
              let s = c.trim().toLowerCase();
              if (s.startsWith('.')) s = s.substring(1);
              if (s.startsWith('www.')) s = s.substring(4);
              if (s) existingServices.add(s);
            });
          }

          if (source['Credentials'] && Array.isArray(source['Credentials'])) {
            for (const cred of source['Credentials']) {
              const urlStr = cred.URL || cred.url || '';
              try {
                const urlObj = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
                let s = urlObj.hostname.toLowerCase();
                if (s.startsWith('www.')) s = s.substring(4);
                if (s) existingServices.add(s);
              } catch (e) {
                let s = urlStr.toLowerCase();
                if (s.startsWith('www.')) s = s.substring(4);
                if (s) existingServices.add(s);
              }

              const userStr = (cred.USER || cred.user || cred.username || '').trim();
              if (userStr) {
                if (userStr.includes('@')) {
                  const parts = userStr.split('@');
                  const prefix = parts[0];
                  const domain = parts[1];
                  if (domain && !EMAIL_DOMAIN_BLACKLIST.has(domain.toLowerCase())) {
                    uniqueEmails.add(userStr);
                  }
                  if (prefix && !/^\d+$/.test(prefix) && prefix.length > 4 && !USERNAME_BLACKLIST.has(prefix.toLowerCase())) {
                    uniqueUsernames.add(prefix);
                  }
                } else if (!/^\d+$/.test(userStr) && userStr.length > 4 && !USERNAME_BLACKLIST.has(userStr.toLowerCase())) {
                  uniqueUsernames.add(userStr);
                }
              }
            }
          }
        }
      }
    }

    const amplificationResults = { usernames: [], emails: [] };

    // Phase 1: Process Usernames
    const usernamesToProcess = Array.from(uniqueUsernames);
    if (usernamesToProcess.length > 0) {
      for (const username of usernamesToProcess) {
        if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId} (User: ${username})...`;
        floatingAnalysisText.textContent = `OSINT Query: ${username} (SU ${groupId})`;
        try {
          console.log(`[Amplify] Dispatching POST /api/v1/investigate for username: ${username}`);
          const taskId = await investigate({ username: username });
          let result = null;
          while (true) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await checkInvestigationStatus(taskId);
            if (status.status === 'SUCCESS') { result = status.result; break; }
            else if (status.status === 'FAILURE') { break; }
          }
          if (result && result.profiles_data) {
            const sherlockRaw = result.identity_presence?.sherlock_discoveries || [];

            // Filter Sherlock hits against existingServices
            const sherlock = [];
            for (const urlStr of sherlockRaw) {
              try {
                let sName = new URL(urlStr).hostname.toLowerCase();
                if (sName.startsWith('www.')) sName = sName.substring(1);
                if (!existingServices.has(sName)) {
                  sherlock.push({ site: sName, url: urlStr });
                }
              } catch (e) { }
            }



            if (sherlock.length > 0) {
              amplificationResults.usernames.push({
                username: username,
                sherlock: sherlock
              });
            }
          }
        } catch (e) {
          console.error(`[Amplify] Error checking status for username ${username}: `, e);
        }
      }
    }

    // Phase 2: Process Emails
    const emailsToProcess = Array.from(uniqueEmails);
    if (emailsToProcess.length > 0) {
      for (const email of emailsToProcess) {
        if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId} (Email: ${email})...`;
        floatingAnalysisText.textContent = `OSINT Query: ${email} (SU ${groupId})`;
        try {
          console.log(`[Amplify] Dispatching POST /api/v1/investigate for email: ${email}`);
          const taskId = await investigate({ email: email });
          let result = null;
          while (true) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await checkInvestigationStatus(taskId);
            if (status.status === 'SUCCESS') { result = status.result; break; }
            else if (status.status === 'FAILURE') { break; }
          }

          // Holehe execution
          if (result && result.identity_presence) {
            const holeheRaw = result.identity_presence.email_linked_accounts_holehe || [];
            const holehe = [];

            for (const h of holeheRaw) {
              if (h.domain && h.exists && !existingServices.has(h.domain.toLowerCase())) {
                holehe.push(h);
              }
            }

            if (holehe.length > 0) {
              amplificationResults.emails.push({
                email: email,
                holehe: holehe
              });
            }
          }
        } catch (e) { }
      }
    }

    if (amplificationResults.usernames.length > 0 || amplificationResults.emails.length > 0) {
      suNode.amplifiedInfo = amplificationResults;

      // Map back to GraphManager for visual nodes
      for (const res of amplificationResults.usernames) {
        if (res.sherlock) {
          for (const s of res.sherlock) {
            if (!existingServices.has(s.site)) {
              const sNodeId = `service_${s.site}`;
              graphManager.addNode({ id: sNodeId, type: 'service', label: s.site, hostname: s.site, sourceType: 'amplified' }, true);
              graphManager.addEdge({ from: groupId, to: sNodeId, type: 'amplified_sherlock' }, true);
              existingServices.add(s.site);
            }
          }
        }

      }
      for (const res of amplificationResults.emails) {
        if (res.holehe) {
          for (const h of res.holehe) {
            if (!existingServices.has(h.domain.toLowerCase())) {
              const sNodeId = `service_${h.domain}`;
              graphManager.addNode({ id: sNodeId, type: 'service', label: h.domain, hostname: h.domain, sourceType: 'amplified' }, true);
              graphManager.addEdge({ from: groupId, to: sNodeId, type: 'amplified_holehe' }, true);
              existingServices.add(h.domain.toLowerCase());
            }
          }
        }
      }
    }

    // Re-run local Pre-analysis with the new amplified info blended in
    const reAnalysisResult = performLocalPreAnalysis(rawRecords, suNode.country, suNode.emailContexts);

    // Enhance reAnalysisResult based on amplification
    if (suNode.amplifiedInfo) {
      for (const res of suNode.amplifiedInfo.usernames || []) {
        if (res.sherlock && res.sherlock.length > 0) {
          reAnalysisResult.socials.push({ platform: 'Sherlock', user: res.username, pass: `${res.sherlock.length} hits` });
        }
      }
      for (const res of suNode.amplifiedInfo.emails || []) {
        if (res.holehe && res.holehe.length > 0) {
          reAnalysisResult.socials.push({ platform: 'Holehe', user: res.email, pass: `${res.holehe.length} hits` });
        }
      }

      // Re-evaluate status
      if (reAnalysisResult.phone) {
        reAnalysisResult.status = 'Very Identifiable';
      } else if (reAnalysisResult.socials.length >= 3) {
        reAnalysisResult.status = 'Very Identifiable';
      } else if (reAnalysisResult.socials.length === 1 || reAnalysisResult.socials.length === 2) {
        reAnalysisResult.status = 'Possible Identifiable';
      } else {
        reAnalysisResult.status = 'Not Identifiable';
      }
    }

    const isIdentifiable = reAnalysisResult.status === 'Very Identifiable';
    const isPossible = reAnalysisResult.status === 'Possible Identifiable';
    const reasons = ['Amplified using Backend OSINT data.', 'Found new external footprint links.'];

    suNode.aiAnalysis = {
      identifiable: isIdentifiable,
      possibleIdentifiable: isPossible,
      reasons: reasons,
      evidence: [],
      _cryptoWallets: reAnalysisResult.cryptoWallets || []
    };

    graphManager.setSuperuserIdentifiable(groupId, isIdentifiable, isPossible);

    for (const uid of suNode.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (reAnalysisResult.inferredCountry && !u.country) u.country = reAnalysisResult.inferredCountry;
        u.aiAnalysis = JSON.parse(JSON.stringify(suNode.aiAnalysis));
        graphManager.setUserIdentifiable(uid, isIdentifiable, reasons, isPossible);
      }
    }

    graphManager.stopNodeBlink(groupId);
    processed++;
    const pct = Math.round((processed / total) * 100);
    exploreProgressBar.style.width = `${pct}%`;
    exploreProgressCount.textContent = `${processed} / ${total}`;
  }

  aiRunning = false;
  btnAmplifyUsers.classList.remove('running');
  btnAmplifyUsers.disabled = false;
  exploreProgressLabel.textContent = 'Amplification complete!';
  btnAmplifyUsers.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 3a7 7 0 0 0-7 7c0 3.86 3.14 7 7 7s7-3.14 7-7a7 7 0 0 0-7-7z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M10 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" fill="currentColor"/>
        <path d="M14 6l-2 2M6 6l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      Amplify non identifiable users
  `;

  updateAIButtonState();
  populateCountryFilter(graphManager.allNodesData);
  setTimeout(() => { exploreProgressContainer.style.display = 'none'; }, 3000);

  if (amplifyProgressLabel) {
    amplifyProgressLabel.textContent = 'Amplification complete!';
    setTimeout(() => { amplifyProgressLabel.style.display = 'none'; }, 4000);
  }
  floatingAnalysisStatus.style.display = 'none';
  showToast('Amplification OSINT queries finished successfully!', 'success');
}

/**
 * Amplifies a single selected superuser from the Context Menu
 */
async function handleAmplifySingleSuperuser(suNode) {
  if (aiRunning) return;
  aiRunning = true;

  const amplifyProgressLabel = document.getElementById('amplify-progress-label');
  const exploreProgressContainer = document.getElementById('explore-progress-container');
  const exploreProgressBar = document.getElementById('explore-progress-bar');
  const exploreProgressCount = document.getElementById('explore-progress-count');
  const exploreProgressLabel = document.getElementById('explore-progress-label');

  exploreProgressContainer.style.display = 'block';
  exploreProgressLabel.textContent = 'Seeking non-identifiable superusers...';
  exploreProgressBar.style.width = '0%';
  exploreProgressCount.textContent = '0 / 0';

  floatingAnalysisStatus.style.display = 'flex';
  floatingAnalysisText.textContent = `Amplifying non-identifiable superuser: ${suNode.id}...`;

  const superusersToAmplify = [suNode]; // Just process this one node
  const total = 1;
  let processed = 0;

  for (const suNode of superusersToAmplify) {
    const groupId = suNode.id;
    if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId}...`;
    floatingAnalysisText.textContent = `Amplifying OSINT: SU ${groupId} (${processed}/${total})`;
    graphManager.startNodeBlink(groupId, '#00C8FF');

    const uniqueUsernames = new Set();
    const uniqueEmails = new Set();
    const existingServices = new Set();
    const rawRecords = [];

    for (const uid of suNode.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u && u._explorationData && u._explorationData.rawRecords) {
        rawRecords.push(...u._explorationData.rawRecords);
        for (const record of u._explorationData.rawRecords) {
          const source = record._source || record;

          if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
            source['Cookie list'].forEach(c => {
              let s = c.trim().toLowerCase();
              if (s.startsWith('.')) s = s.substring(1);
              if (s.startsWith('www.')) s = s.substring(4);
              if (s) existingServices.add(s);
            });
          }

          if (source['Credentials'] && Array.isArray(source['Credentials'])) {
            for (const cred of source['Credentials']) {
              const urlStr = cred.URL || cred.url || '';
              try {
                const urlObj = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
                let s = urlObj.hostname.toLowerCase();
                if (s.startsWith('www.')) s = s.substring(4);
                if (s) existingServices.add(s);
              } catch (e) {
                let s = urlStr.toLowerCase();
                if (s.startsWith('www.')) s = s.substring(4);
                if (s) existingServices.add(s);
              }

              const userStr = (cred.USER || cred.user || cred.username || '').trim();
              if (userStr) {
                if (userStr.includes('@')) {
                  const parts = userStr.split('@');
                  const prefix = parts[0];
                  const domain = parts[1];
                  if (domain && !EMAIL_DOMAIN_BLACKLIST.has(domain.toLowerCase())) {
                    uniqueEmails.add(userStr);
                  }
                  if (prefix && !/^\d+$/.test(prefix) && prefix.length > 4 && !USERNAME_BLACKLIST.has(prefix.toLowerCase())) {
                    uniqueUsernames.add(prefix);
                  }
                } else if (!/^\d+$/.test(userStr) && userStr.length > 4 && !USERNAME_BLACKLIST.has(userStr.toLowerCase())) {
                  uniqueUsernames.add(userStr);
                }
              }
            }
          }
        }
      }
    }

    const amplificationResults = { usernames: [], emails: [] };

    // Phase 1: Process Usernames
    const usernamesToProcess = Array.from(uniqueUsernames);
    if (usernamesToProcess.length > 0) {
      for (const username of usernamesToProcess) {
        if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId} (User: ${username})...`;
        floatingAnalysisText.textContent = `OSINT Query: ${username} (SU ${groupId})`;
        try {
          console.log(`[Amplify] Dispatching POST /api/v1/investigate for username: ${username}`);
          const taskId = await investigate({ username: username });
          let result = null;
          while (true) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await checkInvestigationStatus(taskId);
            if (status.status === 'SUCCESS') { result = status.result; break; }
            else if (status.status === 'FAILURE') { break; }
          }
          if (result && result.profiles_data) {
            const sherlockRaw = result.identity_presence?.sherlock_discoveries || [];

            // Filter Sherlock hits against existingServices
            const sherlock = [];
            for (const urlStr of sherlockRaw) {
              try {
                let sName = new URL(urlStr).hostname.toLowerCase();
                if (sName.startsWith('www.')) sName = sName.substring(1);
                if (!existingServices.has(sName)) {
                  sherlock.push({ site: sName, url: urlStr });
                }
              } catch (e) { }
            }



            if (sherlock.length > 0) {
              amplificationResults.usernames.push({
                username: username,
                sherlock: sherlock
              });
            }
          }
        } catch (e) {
          console.error(`[Amplify] Error checking status for username ${username}: `, e);
        }
      }
    }

    // Phase 2: Process Emails
    const emailsToProcess = Array.from(uniqueEmails);
    if (emailsToProcess.length > 0) {
      for (const email of emailsToProcess) {
        if (amplifyProgressLabel) amplifyProgressLabel.textContent = `Amplifying SU ${groupId} (Email: ${email})...`;
        floatingAnalysisText.textContent = `OSINT Query: ${email} (SU ${groupId})`;
        try {
          console.log(`[Amplify] Dispatching POST /api/v1/investigate for email: ${email}`);
          const taskId = await investigate({ email: email });
          let result = null;
          while (true) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await checkInvestigationStatus(taskId);
            if (status.status === 'SUCCESS') { result = status.result; break; }
            else if (status.status === 'FAILURE') { break; }
          }

          // Holehe execution
          if (result && result.identity_presence) {
            const holeheRaw = result.identity_presence.email_linked_accounts_holehe || [];
            const holehe = [];

            for (const h of holeheRaw) {
              if (h.domain && h.exists && !existingServices.has(h.domain.toLowerCase())) {
                holehe.push(h);
              }
            }

            if (holehe.length > 0) {
              amplificationResults.emails.push({
                email: email,
                holehe: holehe
              });
            }
          }
        } catch (e) { }
      }
    }

    if (amplificationResults.usernames.length > 0 || amplificationResults.emails.length > 0) {
      suNode.amplifiedInfo = amplificationResults;

      // Map back to GraphManager for visual nodes
      for (const res of amplificationResults.usernames) {
        if (res.sherlock) {
          for (const s of res.sherlock) {
            if (!existingServices.has(s.site)) {
              const sNodeId = `service_${s.site}`;
              graphManager.addNode({ id: sNodeId, type: 'service', label: s.site, hostname: s.site, sourceType: 'amplified' }, true);
              graphManager.addEdge({ from: groupId, to: sNodeId, type: 'amplified_sherlock' }, true);
              existingServices.add(s.site);
            }
          }
        }
      }
      for (const res of amplificationResults.emails) {
        if (res.holehe) {
          for (const h of res.holehe) {
            if (!existingServices.has(h.domain.toLowerCase())) {
              const sNodeId = `service_${h.domain}`;
              graphManager.addNode({ id: sNodeId, type: 'service', label: h.domain, hostname: h.domain, sourceType: 'amplified' }, true);
              graphManager.addEdge({ from: groupId, to: sNodeId, type: 'amplified_holehe' }, true);
              existingServices.add(h.domain.toLowerCase());
            }
          }
        }
      }
    }

    const reAnalysisResult = performLocalPreAnalysis(rawRecords, suNode.country, suNode.emailContexts);

    if (suNode.amplifiedInfo) {
      for (const res of suNode.amplifiedInfo.usernames || []) {
        if (res.sherlock && res.sherlock.length > 0) {
          reAnalysisResult.socials.push({ platform: 'Sherlock', user: res.username, pass: `${res.sherlock.length} hits` });
        }

      }
      for (const res of suNode.amplifiedInfo.emails || []) {
        if (res.holehe && res.holehe.length > 0) {
          reAnalysisResult.socials.push({ platform: 'Holehe', user: res.email, pass: `${res.holehe.length} hits` });
        }
      }
    }

    if (reAnalysisResult.phone) {
      reAnalysisResult.status = 'Very Identifiable';
    } else if (reAnalysisResult.socials.length >= 3) {
      reAnalysisResult.status = 'Very Identifiable';
    } else if (reAnalysisResult.socials.length === 1 || reAnalysisResult.socials.length === 2) {
      reAnalysisResult.status = 'Possible Identifiable';
    } else {
      reAnalysisResult.status = 'Not Identifiable';
    }

    const isIdentifiable = reAnalysisResult.status === 'Very Identifiable';
    const isPossible = reAnalysisResult.status === 'Possible Identifiable';
    const reasons = ['Amplified using Backend OSINT data.', 'Found new external footprint links.'];

    suNode.aiAnalysis = {
      identifiable: isIdentifiable,
      possibleIdentifiable: isPossible,
      reasons: reasons,
      evidence: [],
      _cryptoWallets: reAnalysisResult.cryptoWallets || []
    };

    graphManager.setSuperuserIdentifiable(groupId, isIdentifiable, isPossible);

    for (const uid of suNode.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (reAnalysisResult.inferredCountry && !u.country) u.country = reAnalysisResult.inferredCountry;
        u.aiAnalysis = JSON.parse(JSON.stringify(suNode.aiAnalysis));
        graphManager.setUserIdentifiable(uid, isIdentifiable, reasons, isPossible);
      }
    }

    graphManager.stopNodeBlink(groupId);
    processed++;
    const pct = Math.round((processed / total) * 100);
    exploreProgressBar.style.width = `${pct}%`;
    exploreProgressCount.textContent = `${processed} / ${total}`;
  }

  aiRunning = false;
  exploreProgressLabel.textContent = 'Amplification complete!';

  updateAIButtonState();
  populateCountryFilter(graphManager.allNodesData);
  setTimeout(() => { exploreProgressContainer.style.display = 'none'; }, 3000);

  if (amplifyProgressLabel) {
    amplifyProgressLabel.textContent = 'Amplification complete!';
    setTimeout(() => { amplifyProgressLabel.style.display = 'none'; }, 4000);
  }
  floatingAnalysisStatus.style.display = 'none';
  showToast('Single-user Amplification OSINT queries finished successfully!', 'success');
}

/**
 * Fetch HWID data and return raw records (without attaching to user nodes)
 */
async function fetchHWIDData(filename) {
  const dataArray = [];
  for await (const batch of searchFullStealerFilename(filename)) {
    dataArray.push(...batch);
  }
  console.log(`[Explore] ${filename}: ${dataArray.length} records`);
  return dataArray;
}

/**
 * Collect users that have HWIDs from their rawData or hwids array
 */
function collectUsersWithHWID(userNodes) {
  const usersWithHWID = [];
  const seenHWIDs = new Set();

  for (const user of userNodes) {
    if (graphManager.isUserExplored(user.id)) continue;

    // Check hwids array (populated during processData)
    if (user.hwids && user.hwids.length > 0) {
      for (const { filename } of user.hwids) {
        if (filename && !seenHWIDs.has(filename)) {
          seenHWIDs.add(filename);
          usersWithHWID.push({ userId: user.id, hwid: filename });
        }
      }
      continue;
    }

    // Fallback: Check rawData for Filename/HWID or search_term
    if (user.rawData && user.rawData.length > 0) {
      for (const record of user.rawData) {
        let filename = record.Filename || record.filename || record.Doc || record.doc || '';

        if (!filename && record.search_term) {
          const hwidMatch = record.search_term.match(/HWID\s+([A-Fa-f0-9]+)/i);
          if (hwidMatch) {
            filename = hwidMatch[1];
          }
        }

        if (filename && !seenHWIDs.has(filename)) {
          seenHWIDs.add(filename);
          usersWithHWID.push({ userId: user.id, hwid: filename, searchTerm: record.search_term || null });
        }
      }
    }
  }

  return usersWithHWID;
}

/**
 * Local OSINT Pre-Analysis (replaces basic AI inferences)
 * Extracts clearcut PII like phones, social profiles, and infers country codes natively.
 */
// Crypto wallet address regex patterns for multi-chain detection
const CRYPTO_WALLET_REGEXES = {
  BTC: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
  BTC_BECH32: /\bbc1[a-zA-HJ-NP-Z0-9]{39,59}\b/g,
  ETH: /\b0x[0-9a-fA-F]{40}\b/g,
  LTC: /\bL[a-km-zA-HJ-NP-Z1-9]{26,33}\b/g,
  XMR: /\b4[0-9AB][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{93}\b/g,
  XRP: /\br[1-9A-HJ-NP-Za-km-z]{25,33}\b/g,
  DASH: /\bX[1-9A-HJ-NP-Za-km-z]{33}\b/g,
};

function performLocalPreAnalysis(rawRecords, existingCountry = null, emailContexts = []) {
  const result = {
    phone: null,
    socials: [],
    cryptoWallets: [],
    inferredCountry: null,
    status: 'Not Identifiable'
  };

  const tldCounts = {};
  const countryTlds = {
    'es': 'ES', 'fr': 'FR', 'de': 'DE', 'it': 'IT', 'uk': 'GB', 'ru': 'RU',
    'br': 'BR', 'mx': 'MX', 'ar': 'AR', 'co': 'CO', 'pe': 'PE', 'cl': 'CL',
    'nl': 'NL', 'pl': 'PL', 'tr': 'TR', 'ca': 'CA', 'au': 'AU', 'in': 'IN',
    'jp': 'JP', 'cn': 'CN', 'kr': 'KR', 'za': 'ZA', 'se': 'SE', 'no': 'NO'
  };

  const socialPlatforms = ['facebook', 'instagram', 'tiktok', 'x', 'twitter', 'telegram', 'steam', 'linkedin'];

  for (const record of rawRecords) {
    const source = record._source || record;

    // 1. Phone extraction
    const phoneKeys = Object.keys(source).filter(k => k.toLowerCase().includes('phone') && !k.toLowerCase().includes('model'));
    for (const key of phoneKeys) {
      if (source[key] && String(source[key]).trim()) {
        const p = String(source[key]).trim();
        if (p !== '000000' && p !== '0000000000' && !/^0+$/.test(p)) {
          result.phone = p; // take first available valid phone
          break;
        }
      }
    }

    // 2. Social Media extraction (from specific keys)
    for (const key of Object.keys(source)) {
      const lowerKey = key.toLowerCase();
      for (const platform of socialPlatforms) {
        if (lowerKey.includes(platform) && (lowerKey.includes('user') || lowerKey.includes('id'))) {
          const val = String(source[key]).trim();
          if (val && val !== 'false' && val !== 'null') {
            // Check if we already have it
            if (!result.socials.find(s => s.platform === platform && s.user === val)) {
              result.socials.push({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), user: val, pass: '-' });
            }
          }
        }
      }
    }

    // 3. Social Media extraction (from credentials list)
    if (source['Credentials'] && Array.isArray(source['Credentials'])) {
      for (const cred of source['Credentials']) {
        const url = (cred.URL || cred.url || '').toLowerCase();
        for (const platform of socialPlatforms) {
          if (url.includes(platform)) {
            const user = (cred.USER || cred.user || '').trim();
            const pass = (cred.PASS || cred.pass || cred.PASSWORD || cred.password || '').trim();
            if (user) {
              if (!result.socials.find(s => s.platform.toLowerCase() === platform && s.user === user)) {
                result.socials.push({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), user, pass });
              }
            }
          }
        }
      }
    }

    // 3b. Wallet extraction from HWID wallets field
    if (source['wallets'] && source['wallets'].trim()) {
      const walletEntries = source['wallets'].split(',').map(w => w.trim()).filter(Boolean);
      for (const entry of walletEntries) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          const provider = entry.substring(0, colonIdx).trim();
          const address = entry.substring(colonIdx + 1).trim();
          if (address && !result.cryptoWallets.find(w => w.address === address)) {
            result.cryptoWallets.push({ provider, address, source: 'HWID' });
          }
        }
      }
    }

    // 3c. Scan credentials for crypto exchange/wallet platform URLs
    if (source['Credentials'] && Array.isArray(source['Credentials'])) {
      const CRYPTO_KEYWORDS = ['binance', 'coinbase', 'metamask', 'exodus', 'blockchain', 'bitcoin', 'ethereum', 'kraken', 'bybit', 'okx', 'crypto', 'wallet', 'ledger', 'trezor', 'phantom', 'solana', 'cex.io'];
      for (const cred of source['Credentials']) {
        const url = (cred.URL || cred.url || '').toLowerCase();
        const user = (cred.USER || cred.user || '').trim();
        if (url && user && CRYPTO_KEYWORDS.some(kw => url.includes(kw))) {
          if (!result.cryptoWallets.find(w => w.address === user)) {
            const platformName = CRYPTO_KEYWORDS.find(kw => url.includes(kw)) || 'Exchange';
            result.cryptoWallets.push({ provider: platformName.charAt(0).toUpperCase() + platformName.slice(1), address: user, source: 'credential' });
          }
        }
      }
    }

    // 3d. Scan all string values in source for crypto addresses
    const sourceStr = JSON.stringify(source);
    for (const [chain, regex] of Object.entries(CRYPTO_WALLET_REGEXES)) {
      regex.lastIndex = 0;
      let addrMatch;
      while ((addrMatch = regex.exec(sourceStr)) !== null) {
        const addr = addrMatch[0];
        if (!result.cryptoWallets.find(w => w.address === addr)) {
          result.cryptoWallets.push({ provider: chain, address: addr, source: 'record' });
        }
      }
    }

    // 4. Country Inference (if none exists)
    if (!existingCountry || existingCountry.trim().toLowerCase() === 'unknown' || existingCountry.trim().toLowerCase() === 'country information not found') {
      const tallyTld = (domainStr) => {
        const clean = domainStr.trim().toLowerCase();
        if (!clean) return;
        const parts = clean.split('.');
        if (parts.length > 0) {
          const tld = parts[parts.length - 1];
          if (countryTlds[tld]) {
            tldCounts[countryTlds[tld]] = (tldCounts[countryTlds[tld]] || 0) + 1;
          }
        }
      };

      if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
        source['Cookie list'].forEach(c => tallyTld(c));
      }
      if (source['Credentials'] && Array.isArray(source['Credentials'])) {
        source['Credentials'].forEach(cred => {
          const urlStr = cred.URL || cred.url || '';
          try {
            const urlObj = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
            tallyTld(urlObj.hostname);
          } catch (e) { tallyTld(urlStr); }
        });
      }
    }
  }

  // 5. Evaluate `emailContexts` natively to extract full_data explicit arrays from Autopivots
  for (const ctx of emailContexts) {
    if (!ctx) continue;
    let obj = ctx;
    if (typeof ctx === 'string') {
      try { obj = JSON.parse(ctx); } catch (e) {
        // Even if not valid JSON, scan the raw string for crypto addresses
        const rawStr = String(ctx);
        for (const [chain, regex] of Object.entries(CRYPTO_WALLET_REGEXES)) {
          regex.lastIndex = 0;
          let addrMatch;
          while ((addrMatch = regex.exec(rawStr)) !== null) {
            const addr = addrMatch[0];
            if (!result.cryptoWallets.find(w => w.address === addr)) {
              result.cryptoWallets.push({ provider: chain, address: addr, source: 'context' });
            }
          }
        }
        continue;
      }
    }

    // Phone 
    if (obj.phone && String(obj.phone).trim() && !result.phone) result.phone = String(obj.phone).trim();
    if (obj.mobile && String(obj.mobile).trim() && !result.phone) result.phone = String(obj.mobile).trim();

    // Known structured platforms (Holehe / Sherlock outputs directly under keys like "holehe" or "social_accounts")
    let arraysToCheck = [];
    if (Array.isArray(obj.social_accounts)) arraysToCheck.push(...obj.social_accounts);
    if (Array.isArray(obj.holehe)) arraysToCheck.push(...obj.holehe);
    if (Array.isArray(obj.sherlock)) arraysToCheck.push(...obj.sherlock);

    for (const item of arraysToCheck) {
      const platformName = (item.name || item.site || item.platform || '').toLowerCase();
      const username = (item.username || obj.username || obj.email || '').split('@')[0];

      for (const platform of socialPlatforms) {
        if (platformName.includes(platform) || (item.url && item.url.includes(platform))) {
          if (!result.socials.find(s => s.platform.toLowerCase() === platform && s.user === username)) {
            result.socials.push({ platform: platform.charAt(0).toUpperCase() + platform.slice(1), user: username, pass: '-' });
          }
        }
      }
    }

    // Fallback: If `username_sites` is present and contains our platform as a sub-array
    if (obj.username_sites && typeof obj.username_sites === 'object') {
      for (const [key, value] of Object.entries(obj.username_sites)) {
        if (socialPlatforms.includes(key.toLowerCase()) && Array.isArray(value) && value.length > 0) {
          const u = value[0].username || value[0].user || obj.email?.split('@')[0] || '?';
          if (!result.socials.find(s => s.platform.toLowerCase() === key.toLowerCase() && s.user === u)) {
            result.socials.push({ platform: key.charAt(0).toUpperCase() + key.slice(1), user: u, pass: '-' });
          }
        }
      }
    }

    // 5b. Scan parsed context object values for crypto wallet addresses
    const contextStr = JSON.stringify(obj);
    for (const [chain, regex] of Object.entries(CRYPTO_WALLET_REGEXES)) {
      regex.lastIndex = 0;
      let addrMatch;
      while ((addrMatch = regex.exec(contextStr)) !== null) {
        const addr = addrMatch[0];
        if (!result.cryptoWallets.find(w => w.address === addr)) {
          result.cryptoWallets.push({ provider: chain, address: addr, source: 'context' });
        }
      }
    }
  }

  // Determine top inferred country if we found 3+ matching domains
  if (Object.keys(tldCounts).length > 0) {
    let topCountry = null;
    let maxCount = 0;
    for (const [c, count] of Object.entries(tldCounts)) {
      if (count > maxCount) { maxCount = count; topCountry = c; }
    }
    if (maxCount >= 3) {
      result.inferredCountry = topCountry;
    }
  }

  // Determine PreAnalysis Status
  if (result.phone || result.socials.length >= 3) {
    result.status = 'Very Identifiable';
  } else if (result.socials.length === 1 || result.socials.length === 2) {
    result.status = 'Possible Identifiable';
  } else {
    result.status = 'Not Identifiable';
  }

  // Force strict format stripping IPs from existing superuser countries matching dropdowns
  if (existingCountry && existingCountry.trim() !== '' && !result.inferredCountry) {
    const rawC = existingCountry.trim();
    const twoLetter = rawC.match(/^([A-Za-z]{2})\b/);
    if (twoLetter) {
      result.inferredCountry = twoLetter[1].toUpperCase();
    } else {
      result.inferredCountry = rawC.replace(/-\s*[\d\.:a-fA-F]+/g, '').replace(/[\d\.:a-fA-F]+/g, '').trim().toUpperCase();
    }
  }

  return result;
}

// ===== Stop Explore (context menu / batch loops) =====
function handleStopExplore() {
  if (exploreController) {
    if (exploreController.paused) {
      exploreController.paused = false;
      showToast('Resuming exploration API calls...', 'info');
    } else {
      exploreController.paused = true;
      showToast('Pausing exploration fetches...', 'warning');
    }
  }
}

// ===== Kill Explore (context menu / batch loops) =====
function handleKillExplore() {
  if (exploreController) {
    exploreController.aborted = true;
    exploreController.paused = false;
    showToast('Killing exploration process...', 'warning');
  }
}

// ===== Explore Single User (context menu) =====
async function handleExploreUserData(userId) {
  if (isExploring) {
    console.warn('[Explore] isExploring globally actively running. Bailing single user request.');
    showToast('Close other exploration searches first.', 'warning')
    return;
  }

  const userNode = graphManager.getUserNodeById(userId);
  if (!userNode) {
    showToast('User node not found', 'error');
    return;
  }

  if (graphManager.isUserExplored(userId)) {
    showToast('User already explored', 'info');
    return;
  }

  // Check if user has HWIDs
  const hwids = [];
  if (userNode.hwids && userNode.hwids.length > 0) {
    for (const { filename } of userNode.hwids) {
      if (filename && !hwids.includes(filename)) hwids.push(filename);
    }
  }

  // Fallback: check rawData
  if (hwids.length === 0 && userNode.rawData) {
    for (const record of userNode.rawData) {
      let filename = record.Filename || record.filename || record.Doc || record.doc || '';
      if (!filename && record.search_term) {
        const hwidMatch = record.search_term.match(/HWID\s+([A-Fa-f0-9]+)/i);
        if (hwidMatch) filename = hwidMatch[1];
      }
      if (filename && !hwids.includes(filename)) hwids.push(filename);
    }
  }

  if (hwids.length === 0) {
    showToast('No HWID/Filename found for this user', 'warning');
    return;
  }

  isExploring = true;
  exploreController = { aborted: false, paused: false };
  showToast(`Exploring user: ${userNode.label}...`, 'info');

  // Fetch data for all HWIDs
  const allRecords = [];
  const discoveredUserIds = new Set([userId]);

  for (const filename of hwids) {
    try {
      const data = await fetchHWIDData(filename);
      allRecords.push(...data);

      // Discover other users sharing this HWID
      for (const record of data) {
        const source = record._source || record;
        if (source['Credentials'] && Array.isArray(source['Credentials'])) {
          for (const cred of source['Credentials']) {
            const credUser = (cred.USER || cred.user || '').toLowerCase();
            if (credUser) {
              const matchingUser = graphManager.getUserNodes().find(u =>
                (u.email && u.email.toLowerCase() === credUser) ||
                (u.username && u.username.toLowerCase() === credUser)
              );
              if (matchingUser) discoveredUserIds.add(matchingUser.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[Explore] Failed for ${filename}:`, e.message);
    }
  }

  // Build superuser data
  const superuserData = {
    cookies: [],
    credentials: [],
    ftpInfo: null,
    country: null,
    logDate: null,
    allHwids: hwids,
    searchTerms: [],
    rawRecords: [],
    wallets: [],
  };

  for (const record of allRecords) {
    const source = record._source || record;
    superuserData.rawRecords.push(source);

    if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
      for (const cookieDomain of source['Cookie list']) {
        const clean = cookieDomain.trim();
        if (!clean || clean.length < 3) continue;
        if (/^[a-z]{20,}$/.test(clean)) continue;
        if (!superuserData.cookies.includes(clean)) {
          superuserData.cookies.push(clean);
        }
      }
    }

    if (source['Credentials'] && Array.isArray(source['Credentials'])) {
      for (const cred of source['Credentials']) {
        superuserData.credentials.push(cred);
      }
    }

    if (source['FTP info'] && source['FTP info'].trim()) {
      superuserData.ftpInfo = source['FTP info'];
    }
    if (source['Country']) superuserData.country = source['Country'];
    if (source['Log date']) superuserData.logDate = source['Log date'];
    if (source.search_term && !superuserData.searchTerms.includes(source.search_term)) {
      superuserData.searchTerms.push(source.search_term);
    }

    // Wallets (format: "Provider:Address" or "Provider:Address,Provider2:Address2")
    if (source['wallets'] && source['wallets'].trim()) {
      const walletEntries = source['wallets'].split(',').map(w => w.trim()).filter(Boolean);
      for (const entry of walletEntries) {
        const colonIdx = entry.indexOf(':');
        if (colonIdx > 0) {
          const provider = entry.substring(0, colonIdx).trim();
          const address = entry.substring(colonIdx + 1).trim();
          if (address && !superuserData.wallets.find(w => w.address === address)) {
            superuserData.wallets.push({ provider, address });
          }
        }
      }
    }
  }

  // Check if any existing superuser already covers these HWIDs
  const existingSuperuser = graphManager.getSuperuserForUser(userId);
  if (existingSuperuser) {
    // Merge into existing superuser
    for (const uid of discoveredUserIds) {
      if (!existingSuperuser.linkedUserIds.includes(uid)) {
        existingSuperuser.linkedUserIds.push(uid);
        graphManager.addEdge({ from: existingSuperuser.id, to: uid, type: 'superuser-user' }, true);
      }
    }
    showToast(`User merged into existing superuser`, 'success');
  } else {
    // Create new superuser
    const linkedUserIds = Array.from(discoveredUserIds);
    const isOrgSuperuser = linkedUserIds.some(uid => {
      const u = graphManager.getUserNodeById(uid);
      return u && u.isOrgEmail;
    });

    const linkedEmails = [];
    const aggregatedContexts = [];
    for (const uid of linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (u.email) linkedEmails.push(u.email);
        if (u.emailContexts && Array.isArray(u.emailContexts)) {
          aggregatedContexts.push(...u.emailContexts);
        }
      }
    }

    const superuserId = `superuser_${Date.now()}`;
    const superuserNode = {
      id: superuserId,
      type: 'superuser',
      label: `Superuser (${linkedUserIds.length})`,
      isOrgSuperuser,
      linkedUserIds,
      linkedEmails,
      allHwids: hwids,
      explorationData: superuserData,
      emailContexts: aggregatedContexts,
      country: superuserData.country,
      aiAnalysis: null,
    };

    graphManager.addNode(superuserNode, true);

    for (const uid of linkedUserIds) {
      graphManager.addEdge({ from: superuserId, to: uid, type: 'superuser-user' }, true);
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        u._explored = true;
        u._superuserId = superuserId;
        u._explorationData = superuserData;
        graphManager.setUserExplored(uid);
      }
    }

  }

  // Rewire incoming parent linkages to the superuser
  const activeSuperuser = existingSuperuser ? existingSuperuser.id : `superuser_${Date.now()}`; // Just fallback if something breaks
  const targetSuId = existingSuperuser ? existingSuperuser.id : (graphManager.getSuperuserForUser(userId) ? graphManager.getSuperuserForUser(userId).id : null);

  if (targetSuId) {
    const suNodeObj = graphManager.getSuperuserNodeById(targetSuId);
    if (suNodeObj && suNodeObj.linkedUserIds) {
      const edgesToDelete = [];
      const newEdges = [];
      for (const uid of suNodeObj.linkedUserIds) {
        const incomingEdges = graphManager.edgesDataset.get({
          filter: e => e.to === uid && e._data &&
            (e._data.type === 'direct-org-user' || e._data.type === 'domain-user' || e._data.type === 'service-user')
        });

        for (const edge of incomingEdges) {
          edgesToDelete.push(edge.id);
          const origEdge = edge._data;
          // Check if edge already exists for su
          const existing = graphManager.edgesDataset.get({ filter: ge => ge.from === origEdge.from && ge.to === targetSuId && ge._data && ge._data.type === origEdge.type && !edgesToDelete.includes(ge.id) }).length > 0;
          if (!existing) {
            newEdges.push({
              from: origEdge.from,
              to: targetSuId,
              type: origEdge.type,
              dashes: origEdge.dashes || false
            });
          }
        }
      }

      if (edgesToDelete.length > 0) graphManager.deleteEdges(edgesToDelete);
      for (const ne of newEdges) graphManager.addEdge(ne, true);
    }
  }

  // Run Local Pre-Analysis on the Target Nodes
  const rootSuperuser = existingSuperuser || graphManager.getSuperuserNodeById(targetSuId);
  if (rootSuperuser) {
    graphManager.startNodeBlink(rootSuperuser.id);
    const result = performLocalPreAnalysis(rootSuperuser.explorationData.rawRecords, rootSuperuser.country, rootSuperuser.emailContexts);

    if (result.inferredCountry && !rootSuperuser.country) {
      rootSuperuser.country = result.inferredCountry;
      rootSuperuser.explorationData.country = result.inferredCountry;
    }

    const reasons = [];
    const countryText = result.inferredCountry || rootSuperuser.country || 'Unknown country';
    const socialsText = result.socials.length > 0 ? `${result.socials.length} social accounts` : 'no social accounts';
    const phoneText = result.phone ? 'has phone' : 'no phone';

    // Add concise summary string as first element
    const prefix = countryText.length === 2 ? 'Country ' : '';
    reasons.push(`Preanalysis result: ${result.status}.<br>Reasons: ${prefix}${countryText}, ${socialsText}, ${phoneText}.`);

    if (result.phone) reasons.push(`Has phone number: Yes - ${result.phone}`);
    if (result.socials.length > 0) {
      reasons.push(`Has social accounts: Yes (${result.socials.length})`);
      result.socials.forEach((s, idx) => {
        reasons.push(`Platform ${idx + 1} ${s.platform} - User: ${s.user} - Pass: ${s.pass}`);
      });
    }

    const isIdentifiable = result.status === 'Very Identifiable';
    const isPossible = result.status === 'Possible Identifiable';
    rootSuperuser.aiAnalysis = {
      identifiable: isIdentifiable,
      possibleIdentifiable: isPossible,
      reasons: reasons,
      evidence: [],
      _cryptoWallets: result.cryptoWallets || []
    };

    graphManager.setSuperuserIdentifiable(rootSuperuser.id, isIdentifiable, isPossible);

    for (const uid of rootSuperuser.linkedUserIds) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (result.inferredCountry && !u.country) u.country = result.inferredCountry;
        u.aiAnalysis = JSON.parse(JSON.stringify(rootSuperuser.aiAnalysis));
        graphManager.setUserIdentifiable(uid, isIdentifiable, Array.from(reasons), isPossible);
      }
    }
    graphManager.stopNodeBlink(rootSuperuser.id);
  }

  // Mark original user as explored
  graphManager.setUserExplored(userId);
  userNode._explored = true;

  // Apply filters to show new nodes
  graphManager.applyFilters(filtersManager.getState());
  populateCountryFilter(graphManager.allNodesData);

  // Update AI button state
  updateAIButtonState();

  isExploring = false;
  exploreController = null;
}

// ===== Autopivot Emails (ContextMenu) =====
async function handleAutopivotEmails(superuserId) {
  if (isExploring) {
    showToast('An exploration is currently active. Please wait.', 'warning');
    return;
  }

  const superuserNode = graphManager.getSuperuserNodeById(superuserId);
  if (!superuserNode || !superuserNode.explorationData || !superuserNode.explorationData.credentials) {
    showToast('No credentials found for this superuser to pivot from.', 'warning');
    return;
  }

  // Find unique emails inside credentials
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  let pivotedEmails = new Set();
  for (const cred of superuserNode.explorationData.credentials) {
    const usr = (cred.user || cred.USER || '').trim();
    if (emailRegex.test(usr)) pivotedEmails.add(usr.toLowerCase());
  }

  // Also extract emails from email contexts using the regex extractor
  const suContextEmails = [];
  const linkedUserIds = superuserNode.linkedUsers || [];
  for (const uid of linkedUserIds) {
    const u = graphManager.getUserNodeById(uid);
    if (u && u.emailContexts) suContextEmails.push(...u.emailContexts);
  }
  if (suContextEmails.length > 0) {
    const extracted = extractUserDataFromContexts(suContextEmails);
    if (extracted && extracted.emails) {
      for (const em of extracted.emails) {
        if (emailRegex.test(em)) pivotedEmails.add(em.toLowerCase());
      }
    }
  }

  // Remove emails already attached to the superuser
  if (superuserNode.linkedEmails && Array.isArray(superuserNode.linkedEmails)) {
    for (const em of superuserNode.linkedEmails) {
      pivotedEmails.delete(em.toLowerCase());
    }
  }

  if (pivotedEmails.size === 0) {
    showToast('No new emails found to pivot.', 'info');
    return;
  }

  isExploring = true;
  exploreController = { aborted: false, paused: false };

  loadingOverlay.style.display = 'flex';
  loadingText.textContent = `Autopivoting ${pivotedEmails.size} emails on Superuser...`;
  const emailsArray = Array.from(pivotedEmails);
  showToast(`Autopivoting on ${emailsArray.length} new emails...`, 'info');

  floatingAnalysisStatus.style.display = 'flex';

  let newEmailsCnt = 0;
  for (let i = 0; i < emailsArray.length; i++) {
    if (exploreController.aborted) break;
    const emailStr = emailsArray[i];
    floatingAnalysisText.textContent = `Pivoting ${emailStr} (${i + 1}/${emailsArray.length})...`;

    try {
      // 1. Fetch full data
      const limit = 1000;
      let fullRecords = [];
      for await (const batch of searchFullDataByField('email', emailStr, null, limit)) {
        fullRecords.push(...batch);
      }
      // 2. Fetch stealer data
      for await (const batch of searchFullStealerByField('email', emailStr, null, limit)) {
        fullRecords.push(...batch);
      }

      if (fullRecords.length === 0) continue;
      newEmailsCnt++;

      // Unify new data, find new HWIDs
      let subHwids = new Set();
      for (const rec of fullRecords) {
        const source = rec._source || rec;
        let fn = source.Filename || source.filename || source.Doc || source.doc;
        if (!fn && source.search_term) {
          const hwMatch = source.search_term.match(/HWID\s+([A-Fa-f0-9]+)/i);
          if (hwMatch) fn = hwMatch[1];
        }
        if (fn) subHwids.add(fn);
      }

      if (subHwids.size === 0) continue;

      // Extract raw data from all newly discovered HWIDs
      for (const hwid of subHwids) {
        if (exploreController.aborted) break;
        floatingAnalysisText.textContent = `Pivoting ${emailStr}: fetching HWID ${hwid}...`;
        try {
          // HWID fetch from both APIs
          for await (const batch of searchFullDataByField('hwid', hwid, null, limit)) {
            fullRecords.push(...batch);
          }
          for await (const batch of searchFullStealerByField('hwid', hwid, null, limit)) {
            fullRecords.push(...batch);
          }
        } catch (err) {
          console.warn(`[Autopivot] Failed fetching HWID ${hwid}:`, err.message);
        }
      }

      // De-duplicate records to prevent recursive mapping bloat
      const uniqueRecordsMap = new Map();
      for (const rec of fullRecords) {
        const key = rec._id || JSON.stringify(rec);
        if (!uniqueRecordsMap.has(key)) uniqueRecordsMap.set(key, rec);
      }
      fullRecords = Array.from(uniqueRecordsMap.values());

      // Extract raw structure similar to handleExploreUserData
      const superuserData = {
        cookies: [],
        credentials: [],
        ftpInfo: null,
        country: null,
        logDate: null,
        allHwids: Array.from(subHwids),
        searchTerms: [emailStr],
        rawRecords: [],
        wallets: [],
      };

      for (const rec of fullRecords) {
        const source = rec._source || rec;
        superuserData.rawRecords.push(source);

        if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
          for (const cook of source['Cookie list']) {
            if (cook.length >= 3 && !/^[a-z]{20,}$/.test(cook.trim())) {
              if (!superuserData.cookies.includes(cook.trim())) superuserData.cookies.push(cook.trim());
            }
          }
        }
        if (source['Credentials'] && Array.isArray(source['Credentials'])) {
          for (const cred of source['Credentials']) superuserData.credentials.push(cred);
        }
        // Support fulldata structure merging
        if (source.full_data) {
          const userObj = source.full_data.full_data || source.full_data;
          superuserData.credentials.push({
            url: userObj.url || '',
            user: userObj.user || userObj.USER || '',
            pass: userObj.pas || userObj.pass || userObj.password || ''
          });
        }

        if (source['Country'] && !superuserData.country) superuserData.country = source['Country'];

        // Metadata fields
        if (source['FTP info'] && source['FTP info'].trim()) superuserData.ftpInfo = source['FTP info'];
        if (source['VPN info'] && source['VPN info'].trim()) superuserData.vpnInfo = source['VPN info'];
        if (source['Telegram Data'] && source['Telegram Data'].trim()) superuserData.telegramData = source['Telegram Data'];
        if (source['Telegram ID'] && source['Telegram ID'].trim()) superuserData.telegramId = source['Telegram ID'];
        if (source['Telegram Phone'] && source['Telegram Phone'].trim()) superuserData.telegramPhone = source['Telegram Phone'];
        if (source['Telegram chats'] && source['Telegram chats'].trim()) superuserData.telegramChats = source['Telegram chats'];
        if (source['Telegram groups'] && source['Telegram groups'].trim()) superuserData.telegramGroups = source['Telegram groups'];

        // Wallets
        if (source['wallets'] && source['wallets'].trim()) {
          const walletEntries = source['wallets'].split(',').map(w => w.trim()).filter(Boolean);
          for (const entry of walletEntries) {
            const colonIdx = entry.indexOf(':');
            if (colonIdx > 0) {
              const provider = entry.substring(0, colonIdx).trim();
              const address = entry.substring(colonIdx + 1).trim();
              if (address && !superuserData.wallets.find(w => w.address === address)) {
                superuserData.wallets.push({ provider, address });
              }
            }
          }
        }
      } 
      // Skip merging explicitly per requirement: Create new superuser & connect.

      const subUserId = `user_email_${emailStr.replace(/[^a-zA-Z0-9]/g, '_')}`;
      let isBrandNewUser = false;
      let userNode = graphManager.getUserNodeById(subUserId); // Check if user already exists
      if (!userNode) {
        isBrandNewUser = true;
        userNode = {
          id: subUserId,
          type: 'user',
          label: emailStr,
          email: emailStr,
          hwids: Array.from(subHwids).map(h => ({ filename: h })),
          rawData: [],
          isOrgEmail: false,
          _explored: true,
          _explorationData: superuserData
        };
        graphManager.addNode(userNode, true);
      } else {
        userNode._explored = true;
        userNode._explorationData = superuserData;
      }

      // Fallback user name/username extraction from Telegram chats header
      if (superuserData.telegramChats && !superuserData.telegramChats.startsWith('ID ')) {
        const profileMatch = superuserData.telegramChats.match(/^(.*?)\s+Username\s+(.*?)\s+Phone/i);
        if (profileMatch) {
          const extractedName = profileMatch[1].trim();
          const extractedUser = profileMatch[2].trim();
          let needsUpdate = false;

          if ((!userNode.name || userNode.name === 'None') && extractedName && extractedName !== 'C' && extractedName !== 'Sq') {
            userNode.name = extractedName;
            needsUpdate = true;
          }
          if ((!userNode.username || userNode.username === 'None') && extractedUser && extractedUser !== 'None') {
            userNode.username = extractedUser;
            needsUpdate = true;
          }
          if (needsUpdate) {
            if (userNode.email && userNode.name) userNode.label = `${userNode.name}\\n${userNode.email}`;
            try { graphManager.nodesDataset.update(graphManager._toVisNode(userNode)); } catch (e) { }
          }
        }
      }

      // Edge from Original Superuser -> New User
      graphManager.addEdge({ from: superuserId, to: userNode.id, type: isBrandNewUser ? 'superuser-new-user' : 'superuser-user' }, true);

      // ---------------------------------------------------------------------
      // AGGREGATE ALL DISCOVERED DATA INTO THE ROOT SUPERUSER
      // ---------------------------------------------------------------------
      if (!superuserNode.explorationData) superuserNode.explorationData = { credentials: [], cookies: [], rawRecords: [] };
      if (!superuserNode.allHwids) superuserNode.allHwids = [];

      // 1. HWIDs
      const origHwids = superuserNode.allHwids;
      const isNewHwid = Array.from(subHwids).some(hwid => !origHwids.includes(hwid));

      if (subHwids.size > 0) {
        if (origHwids.length > 0) origHwids.push(''); // Add padding linebreak
        origHwids.push(`HWIDs from ${emailStr}:`);
        for (const hwid of subHwids) {
          if (!origHwids.includes(hwid)) origHwids.push(hwid);
        }
      }

      // 2. Credentials
      const origCreds = superuserNode.explorationData.credentials;
      const isNewCred = superuserData.credentials.some(newCred => {
        const nu = (newCred.user || newCred.USER || '').toLowerCase().trim();
        const np = (newCred.pass || newCred.pas || newCred.password || '').trim();
        const nurl = (newCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        return !origCreds.some(oldCred => {
          const ou = (oldCred.user || oldCred.USER || '').toLowerCase().trim();
          const op = (oldCred.pass || oldCred.pas || oldCred.password || '').trim();
          const ourl = (oldCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
          return ou === nu && op === np && (!nurl || !ourl || ourl === nurl || ourl.includes(nurl) || nurl.includes(ourl));
        });
      });

      if (superuserData.credentials.length > 0) {
        for (const newCred of superuserData.credentials) {
          const nu = (newCred.user || newCred.USER || '').toLowerCase().trim();
          const np = (newCred.pass || newCred.pas || newCred.password || '').trim();
          const nurl = (newCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
          const isDup = origCreds.some(oldCred => {
            const ou = (oldCred.user || oldCred.USER || '').toLowerCase().trim();
            const op = (oldCred.pass || oldCred.pas || oldCred.password || '').trim();
            const ourl = (oldCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
            return ou === nu && op === np && (!nurl || !ourl || ourl === nurl || ourl.includes(nurl) || nurl.includes(ourl));
          });
          if (!isDup) origCreds.push(newCred);
        }
      }

      // 3. Cookies
      const origCooks = superuserNode.explorationData.cookies || [];
      const isNewContext = superuserData.cookies.some(newCook => !origCooks.includes(newCook.trim()));

      if (superuserData.cookies.length > 0) {
        if (origCooks.length > 0) origCooks.push('');
        origCooks.push(`Cookie domains from ${emailStr}:`);
        for (const newCook of superuserData.cookies) {
          if (!origCooks.includes(newCook.trim())) {
            origCooks.push(newCook.trim());
          }
        }
      }
      superuserNode.explorationData.cookies = origCooks;

      // 4. Metadata (Contexts)
      if (superuserData.country && !superuserNode.explorationData.country) superuserNode.explorationData.country = superuserData.country;
      if (superuserData.rawRecords.length > 0) {
        superuserNode.explorationData.rawRecords.push(...superuserData.rawRecords);
      }

      // Inject context array onto root supernode if full_data structures exist
      if (!superuserNode.emailContexts) superuserNode.emailContexts = [];
      for (const rec of fullRecords) {
        const source = rec._source || rec;
        if (source.full_data || source.Context) {
          const block = { ... (source.full_data?.full_data || source.full_data || source.Context || source) };
          block._autopivotOrigin = `Context from email: ${emailStr}`;
          superuserNode.emailContexts.push(block);
        }
      }

      // ---------------------------------------------------------------------
      // UPDATE SUB-NODES IF NECESSARY FOR DATA INTEGRITY
      // ---------------------------------------------------------------------
      if (isNewHwid) {
        const newSuperuserId = `superuser_${Date.now()}_${i}`;
        const newSuperuserNode = {
          id: newSuperuserId,
          type: 'superuser',
          hidden: true, // Added hidden: true
          label: `SU #${newSuperuserId.replace('superuser_', '')}`,
          isOrgSuperuser: false,
          linkedUserIds: [userNode.id],
          linkedEmails: [emailStr],
          allHwids: Array.from(subHwids),
          explorationData: superuserData,
          country: superuserData.country,
          aiAnalysis: null,
        };

        graphManager.addNode(newSuperuserNode, true);
        userNode._superuserId = newSuperuserId;

        // Edge from New Superuser -> New User
        graphManager.addEdge({ from: newSuperuserId, to: userNode.id, type: isBrandNewUser ? 'superuser-new-user' : 'superuser-user', hidden: true }, true);
      }

      // ---------------------------------------------------------------------

      // Mark the superuser as pivot-completed
      superuserNode._autopivoted = true;

      // Re-evaluate original root superuser with the new aggregated data
      // (HWIDs have explicitly been pushed to allHwids array first)
      const result = performLocalPreAnalysis(superuserNode.explorationData.rawRecords, superuserNode.country, superuserNode.emailContexts);
      if (result.inferredCountry && !superuserNode.country) {
        superuserNode.country = result.inferredCountry;
        superuserNode.explorationData.country = result.inferredCountry;
      }

      // Force update of root supernode
      graphManager.nodesDataset.update(graphManager._toVisNode(superuserNode));

      const reasons = [];
      const countryText = result.inferredCountry || superuserNode.country || 'Unknown country';
      const socialsText = result.socials.length > 0 ? `${result.socials.length} social accounts` : 'no social accounts';
      const phoneText = result.phone ? 'has phone' : 'no phone';

      const prefix = countryText.length === 2 ? 'Country ' : '';
      reasons.push(`Preanalysis result: ${result.status}.<br>Reasons: ${prefix}${countryText}, ${socialsText}, ${phoneText}.`);

      if (result.phone) reasons.push(`Has phone number: Yes - ${result.phone}`);
      if (result.socials.length > 0) {
        reasons.push(`Has social accounts: Yes (${result.socials.length})`);
        result.socials.forEach((s, idx) => {
          reasons.push(`Platform ${idx + 1} ${s.platform} - User: ${s.user} - Pass: ${s.pass}`);
        });
      }

      const isIdentifiable = result.status === 'Very Identifiable';
      const isPossible = result.status === 'Possible Identifiable';

      superuserNode.aiAnalysis = {
        identifiable: isIdentifiable,
        possibleIdentifiable: isPossible,
        reasons: reasons,
        evidence: [],
        _cryptoWallets: result.cryptoWallets || []
      };

      graphManager.setSuperuserIdentifiable(superuserId, isIdentifiable, isPossible);
      graphManager.setUserIdentifiable(userNode.id, isIdentifiable, reasons, isPossible);

      graphManager.setUserExplored(userNode.id);

      // Rewire incoming parent linkages to the active superuser
      const targetSuId = isNewHwid ? newSuperuserId : superuserId;
      if (targetSuId && userNode.id) {
        const incomingEdges = graphManager.edgesDataset.get({
          filter: e => e.to === userNode.id && e._data &&
            (e._data.type === 'direct-org-user' || e._data.type === 'domain-user' || e._data.type === 'service-user')
        });

        if (incomingEdges.length > 0) {
          const edgesToDelete = [];
          const newEdges = [];

          for (const edge of incomingEdges) {
            edgesToDelete.push(edge.id);
            const origEdge = edge._data;
            // Check if edge already exists for su
            const existing = graphManager.edgesDataset.get({ filter: ge => ge.from === origEdge.from && ge.to === targetSuId && ge._data && ge._data.type === origEdge.type && !edgesToDelete.includes(ge.id) }).length > 0;
            if (!existing) {
              newEdges.push({
                from: origEdge.from,
                to: targetSuId,
                type: origEdge.type,
                dashes: origEdge.dashes || false
              });
            }
          }

          if (edgesToDelete.length > 0) graphManager.deleteEdges(edgesToDelete);
          for (const ne of newEdges) graphManager.addEdge(ne, true);
        }
      }

    } catch (e) {
      console.warn(`Autopivot failed for ${emailStr}:`, e);
    }
  }

  floatingAnalysisStatus.style.display = 'none';

  graphManager.applyFilters(filtersManager.getState());
  populateCountryFilter(graphManager.allNodesData);
  updateAIButtonState();

  // Refresh layout
  graphManager.setMode(graphManager.layoutMode);

  setTimeout(() => {
    // Check if hideLoadingOverlay exists, else use standard display clear
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    } else {
      loadingOverlay.style.display = 'none';
    }

    // Focus the camera directly onto the original superuser
    if (graphManager.network) {
      graphManager.network.focus(superuserId, {
        scale: 1.0,
        animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
      });
    }

    // Blink the superuser 3 times (ON/OFF x 3 = 6 transitions)
    let blinkCount = 0;
    const blinkInterval = setInterval(() => {
      if (blinkCount >= 6) {
        clearInterval(blinkInterval);
        try { graphManager.nodesDataset.update({ id: superuserId, opacity: 1 }); } catch (e) { }
      } else {
        const opacity = (blinkCount % 2 === 0) ? 0.3 : 1;
        try { graphManager.nodesDataset.update({ id: superuserId, opacity: opacity }); } catch (e) { }
        blinkCount++;
      }
    }, 300);
  }, 300);

  isExploring = false;
  exploreController = null;
  showToast(`Autopivot completed. Processed ${emailsArray.length} new emails (${newEmailsCnt} returned data). Running preidentify...`, 'success');

  // Re-run preidentify all users after autopivot completes
  await handlePreidentifyAllUsers();
}

// ===== Autopivot Phones (ContextMenu) =====
async function handleAutopivotPhones(superuserId) {
  if (isExploring) {
    showToast('An exploration is currently active. Please wait.', 'warning');
    return;
  }

  const superuserNode = graphManager.getSuperuserNodeById(superuserId);
  if (!superuserNode || !superuserNode.explorationData) {
    showToast('No exploration data found for this superuser.', 'warning');
    return;
  }

  // Collect phones from extracted context data
  const phoneRegex = /^[\+\d\s\-\(\)]{5,15}$/;
  let pivotedPhones = new Set();

  // 1. Extract phones from email contexts
  const suContexts = [];
  const linkedUserIds = superuserNode.linkedUsers || [];
  for (const uid of linkedUserIds) {
    const u = graphManager.getUserNodeById(uid);
    if (u && u.emailContexts) suContexts.push(...u.emailContexts);
  }
  if (suContexts.length > 0) {
    const extracted = extractUserDataFromContexts(suContexts);
    if (extracted && extracted.phones) {
      for (const ph of extracted.phones) {
        const digits = ph.replace(/\D/g, '');
        if (digits.length >= 5 && digits.length <= 15) pivotedPhones.add(ph.trim());
      }
    }
  }

  // 2. Check user phone fields
  for (const uid of linkedUserIds) {
    const u = graphManager.getUserNodeById(uid);
    if (u && u.phone && u.phone !== 'None' && u.phone.trim()) {
      const digits = u.phone.replace(/\D/g, '');
      if (digits.length >= 5 && digits.length <= 15) pivotedPhones.add(u.phone.trim());
    }
  }

  // 3. Check Telegram Phone from exploration data (if not already found)
  const telePhone = superuserNode.explorationData?.telegramPhone || superuserNode.telegramPhone;
  if (telePhone && telePhone.trim() && telePhone.trim() !== 'None') {
    const digits = telePhone.replace(/\D/g, '');
    if (digits.length >= 5 && digits.length <= 15 && !pivotedPhones.has(telePhone.trim())) {
      pivotedPhones.add(telePhone.trim());
    }
  }

  if (pivotedPhones.size === 0) {
    showToast('No phone numbers found to pivot.', 'info');
    return;
  }

  isExploring = true;
  exploreController = { aborted: false, paused: false };

  loadingOverlay.style.display = 'flex';
  loadingText.textContent = `Autopivoting ${pivotedPhones.size} phones on Superuser...`;
  const phonesArray = Array.from(pivotedPhones);
  showToast(`Autopivoting on ${phonesArray.length} phone numbers...`, 'info');

  floatingAnalysisStatus.style.display = 'flex';

  let newPhonesCnt = 0;
  for (let i = 0; i < phonesArray.length; i++) {
    if (exploreController.aborted) break;
    const phoneStr = phonesArray[i];
    floatingAnalysisText.textContent = `Pivoting phone ${phoneStr} (${i + 1}/${phonesArray.length})...`;

    try {
      const limit = 1000;
      let fullRecords = [];

      // 1. Fetch from /fulldata/phone/
      for await (const batch of searchFullDataByField('phone', phoneStr, null, limit)) {
        fullRecords.push(...batch);
      }
      // 2. Fetch from /fullstealer/phone/
      for await (const batch of searchFullStealerByField('phone', phoneStr, null, limit)) {
        fullRecords.push(...batch);
      }
      // 3. Fetch from /fullstealer/telephone/
      for await (const batch of searchFullStealerByField('telephone', phoneStr, null, limit)) {
        fullRecords.push(...batch);
      }

      if (fullRecords.length === 0) continue;
      newPhonesCnt++;

      // Unify new data, find new HWIDs
      let subHwids = new Set();
      for (const rec of fullRecords) {
        const source = rec._source || rec;
        let fn = source.Filename || source.filename || source.Doc || source.doc;
        if (!fn && source.search_term) {
          const hwMatch = source.search_term.match(/HWID\s+([A-Fa-f0-9]+)/i);
          if (hwMatch) fn = hwMatch[1];
        }
        if (fn) subHwids.add(fn);
      }

      if (subHwids.size === 0) continue;

      // Extract raw data from all newly discovered HWIDs
      for (const hwid of subHwids) {
        if (exploreController.aborted) break;
        floatingAnalysisText.textContent = `Pivoting phone ${phoneStr}: fetching HWID ${hwid}...`;
        try {
          for await (const batch of searchFullDataByField('hwid', hwid, null, limit)) {
            fullRecords.push(...batch);
          }
          for await (const batch of searchFullStealerByField('hwid', hwid, null, limit)) {
            fullRecords.push(...batch);
          }
        } catch (err) {
          console.warn(`[AutopivotPhones] Failed fetching HWID ${hwid}:`, err.message);
        }
      }

      // De-duplicate records
      const uniqueRecordsMap = new Map();
      for (const rec of fullRecords) {
        const key = rec._id || JSON.stringify(rec);
        if (!uniqueRecordsMap.has(key)) uniqueRecordsMap.set(key, rec);
      }
      fullRecords = Array.from(uniqueRecordsMap.values());

      // Build superuser data structure
      const superuserData = {
        cookies: [],
        credentials: [],
        ftpInfo: null,
        country: null,
        logDate: null,
        allHwids: Array.from(subHwids),
        searchTerms: [phoneStr],
        rawRecords: [],
      };

      for (const rec of fullRecords) {
        const source = rec._source || rec;
        superuserData.rawRecords.push(source);

        if (source['Cookie list'] && Array.isArray(source['Cookie list'])) {
          for (const cook of source['Cookie list']) {
            if (cook.length >= 3 && !/^[a-z]{20,}$/.test(cook.trim())) {
              if (!superuserData.cookies.includes(cook.trim())) superuserData.cookies.push(cook.trim());
            }
          }
        }
        if (source['Credentials'] && Array.isArray(source['Credentials'])) {
          for (const cred of source['Credentials']) superuserData.credentials.push(cred);
        }
        if (source.full_data) {
          const userObj = source.full_data.full_data || source.full_data;
          superuserData.credentials.push({
            url: userObj.url || '',
            user: userObj.user || userObj.USER || '',
            pass: userObj.pas || userObj.pass || userObj.password || ''
          });
        }

        if (source['Country'] && !superuserData.country) superuserData.country = source['Country'];
        if (source['FTP info'] && source['FTP info'].trim()) superuserData.ftpInfo = source['FTP info'];
        if (source['VPN info'] && source['VPN info'].trim()) superuserData.vpnInfo = source['VPN info'];
        if (source['Telegram Data'] && source['Telegram Data'].trim()) superuserData.telegramData = source['Telegram Data'];
        if (source['Telegram ID'] && source['Telegram ID'].trim()) superuserData.telegramId = source['Telegram ID'];
        if (source['Telegram Phone'] && source['Telegram Phone'].trim()) superuserData.telegramPhone = source['Telegram Phone'];
        if (source['Telegram chats'] && source['Telegram chats'].trim()) superuserData.telegramChats = source['Telegram chats'];
        if (source['Telegram groups'] && source['Telegram groups'].trim()) superuserData.telegramGroups = source['Telegram groups'];

        // Wallets
        if (source['wallets'] && source['wallets'].trim()) {
          const walletEntries = source['wallets'].split(',').map(w => w.trim()).filter(Boolean);
          for (const entry of walletEntries) {
            const colonIdx = entry.indexOf(':');
            if (colonIdx > 0) {
              const provider = entry.substring(0, colonIdx).trim();
              const address = entry.substring(colonIdx + 1).trim();
              if (address && !superuserData.wallets.find(w => w.address === address)) {
                superuserData.wallets.push({ provider, address });
              }
            }
          }
        }
      }
      const subUserId = `user_phone_${phoneStr.replace(/[^a-zA-Z0-9]/g, '_')}`;
      let isBrandNewUser = false;
      let userNode = graphManager.getUserNodeById(subUserId);
      if (!userNode) {
        isBrandNewUser = true;
        userNode = {
          id: subUserId,
          type: 'user',
          label: phoneStr,
          email: '',
          phone: phoneStr,
          hwids: Array.from(subHwids).map(h => ({ filename: h })),
          rawData: [],
          isOrgEmail: false,
          _explored: true,
          _explorationData: superuserData
        };
        graphManager.addNode(userNode, true);
      } else {
        userNode._explored = true;
        userNode._explorationData = superuserData;
      }

      // Edge from Original Superuser -> New User
      graphManager.addEdge({ from: superuserId, to: userNode.id, type: isBrandNewUser ? 'superuser-new-user' : 'superuser-user' }, true);

      // AGGREGATE ALL DISCOVERED DATA INTO THE ROOT SUPERUSER
      if (!superuserNode.explorationData) superuserNode.explorationData = { credentials: [], cookies: [], rawRecords: [] };
      if (!superuserNode.allHwids) superuserNode.allHwids = [];

      // HWIDs
      const origHwids = superuserNode.allHwids;
      if (subHwids.size > 0) {
        if (origHwids.length > 0) origHwids.push('');
        origHwids.push(`HWIDs from phone ${phoneStr}:`);
        for (const hwid of subHwids) {
          if (!origHwids.includes(hwid)) origHwids.push(hwid);
        }
      }

      // Credentials
      const origCreds = superuserNode.explorationData.credentials;
      if (superuserData.credentials.length > 0) {
        for (const newCred of superuserData.credentials) {
          const nu = (newCred.user || newCred.USER || '').toLowerCase().trim();
          const np = (newCred.pass || newCred.pas || newCred.password || '').trim();
          const nurl = (newCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
          const isDup = origCreds.some(oldCred => {
            const ou = (oldCred.user || oldCred.USER || '').toLowerCase().trim();
            const op = (oldCred.pass || oldCred.pas || oldCred.password || '').trim();
            const ourl = (oldCred.url || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
            return ou === nu && op === np && (!nurl || !ourl || ourl === nurl || ourl.includes(nurl) || nurl.includes(ourl));
          });
          if (!isDup) origCreds.push(newCred);
        }
      }

      // Cookies
      const origCooks = superuserNode.explorationData.cookies || [];
      if (superuserData.cookies.length > 0) {
        if (origCooks.length > 0) origCooks.push('');
        origCooks.push(`Cookie domains from phone ${phoneStr}:`);
        for (const newCook of superuserData.cookies) {
          if (!origCooks.includes(newCook.trim())) origCooks.push(newCook.trim());
        }
      }
      superuserNode.explorationData.cookies = origCooks;

      // Metadata
      if (superuserData.country && !superuserNode.explorationData.country) superuserNode.explorationData.country = superuserData.country;
      if (superuserData.rawRecords.length > 0) {
        superuserNode.explorationData.rawRecords.push(...superuserData.rawRecords);
      }

      // Inject context array onto root supernode
      if (!superuserNode.emailContexts) superuserNode.emailContexts = [];
      for (const rec of fullRecords) {
        const source = rec._source || rec;
        if (source.full_data || source.Context) {
          const block = { ... (source.full_data?.full_data || source.full_data || source.Context || source) };
          block._autopivotOrigin = `Context from phone: ${phoneStr}`;
          superuserNode.emailContexts.push(block);
        }
      }

      // Mark the superuser
      superuserNode._autopivotedPhones = true;

      // Re-evaluate root superuser
      const result = performLocalPreAnalysis(superuserNode.explorationData.rawRecords, superuserNode.country, superuserNode.emailContexts);
      if (result.inferredCountry && !superuserNode.country) {
        superuserNode.country = result.inferredCountry;
        superuserNode.explorationData.country = result.inferredCountry;
      }

      graphManager.nodesDataset.update(graphManager._toVisNode(superuserNode));

      const reasons = [];
      const countryText = result.inferredCountry || superuserNode.country || 'Unknown country';
      const socialsText = result.socials.length > 0 ? `${result.socials.length} social accounts` : 'no social accounts';
      const phoneText = result.phone ? 'has phone' : 'no phone';

      const prefix = countryText.length === 2 ? 'Country ' : '';
      reasons.push(`Preanalysis result: ${result.status}.<br>Reasons: ${prefix}${countryText}, ${socialsText}, ${phoneText}.`);

      if (result.phone) reasons.push(`Has phone number: Yes - ${result.phone}`);
      if (result.socials.length > 0) {
        reasons.push(`Has social accounts: Yes (${result.socials.length})`);
        result.socials.forEach((s, idx) => {
          reasons.push(`Platform ${idx + 1} ${s.platform} - User: ${s.user} - Pass: ${s.pass}`);
        });
      }

      const isIdentifiable = result.status === 'Very Identifiable';
      const isPossible = result.status === 'Possible Identifiable';

      superuserNode.aiAnalysis = {
        identifiable: isIdentifiable,
        possibleIdentifiable: isPossible,
        reasons: reasons,
        evidence: [],
        _cryptoWallets: result.cryptoWallets || []
      };

      graphManager.setSuperuserIdentifiable(superuserId, isIdentifiable, isPossible);
      graphManager.setUserIdentifiable(userNode.id, isIdentifiable, reasons, isPossible);
      graphManager.setUserExplored(userNode.id);

    } catch (e) {
      console.warn(`AutopivotPhones failed for ${phoneStr}:`, e);
    }
  }

  floatingAnalysisStatus.style.display = 'none';

  graphManager.applyFilters(filtersManager.getState());
  populateCountryFilter(graphManager.allNodesData);
  updateAIButtonState();

  graphManager.setMode(graphManager.layoutMode);

  setTimeout(() => {
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    } else {
      loadingOverlay.style.display = 'none';
    }

    if (graphManager.network) {
      graphManager.network.focus(superuserId, {
        scale: 1.0,
        animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
      });
    }

    let blinkCount = 0;
    const blinkInterval = setInterval(() => {
      if (blinkCount >= 6) {
        clearInterval(blinkInterval);
        try { graphManager.nodesDataset.update({ id: superuserId, opacity: 1 }); } catch (e) { }
      } else {
        const opacity = (blinkCount % 2 === 0) ? 0.3 : 1;
        try { graphManager.nodesDataset.update({ id: superuserId, opacity: opacity }); } catch (e) { }
        blinkCount++;
      }
    }, 300);
  }, 300);

  isExploring = false;
  exploreController = null;
  showToast(`Autopivot phones completed. Processed ${phonesArray.length} phones (${newPhonesCnt} returned data). Running preidentify...`, 'success');

  // Re-run preidentify all users after autopivot completes
  await handlePreidentifyAllUsers();
}

// ===== Analyze Single User (context menu) =====
async function handleAnalyzeUserAI(userId) {
  const userNode = graphManager.getUserNodeById(userId);
  if (!userNode) {
    showToast('User node not found', 'error');
    return;
  }

  showToast(`Analyzing user: ${userNode.label}...`, 'info');

  // Trigger floating status
  floatingAnalysisStatus.style.display = 'flex';
  floatingAnalysisText.textContent = `Analyzing user ${userNode.label} in progress`;

  // Start blink animation
  graphManager.startNodeBlink(userId);

  const result = await analyzeSingleUser(userNode, (id, identifiable, reasons, evidence) => {
    graphManager.setUserIdentifiable(id, identifiable, reasons);
    // Store full AI analysis on the node for Node Actions display
    const node = graphManager.allNodesData.find(n => n.id === id);
    if (node) node.aiAnalysis = { identifiable, reasons, evidence: evidence || [] };
  });

  // Stop blink animation
  graphManager.stopNodeBlink(userId);
  floatingAnalysisStatus.style.display = 'none';

  if (result.identifiable) {
    filtersManager.setIdentifiableVisible(true);
    showToast(`User "${userNode.label}" is identifiable: ${result.reasons.join(', ')}`, 'success');
  } else {
    showToast(`User "${userNode.label}" is not identifiable`, 'info');
  }
}

// ===== Explore & Identify (context menu) =====
async function handleExploreAndIdentify(userId) {
  // First explore
  await handleExploreUserData(userId);

  // Then analyze
  if (graphManager.isUserExplored(userId)) {
    await handleAnalyzeUserAI(userId);
  }
}

function handleNodeContextMenu({ nodeId, nodeData, x, y }) {
  contextMenuTargetNode = { nodeId, nodeData };
  contextMenuTargetEdge = null;

  // Hide all context menu items initially
  ctxExploreUser.style.display = 'none';
  ctxAnalyzeUser.style.display = 'none';
  ctxExploreIdentify.style.display = 'none';
  ctxAmplifySuperuser.style.display = 'none';
  ctxAutopivotEmails.style.display = 'none';
  ctxAutopivotPhones.style.display = 'none';
  ctxShowUserData.style.display = 'none';
  ctxShowSupernode.style.display = 'none';
  ctxShowSocial.style.display = 'none';
  ctxShowAllSocial.style.display = 'none';
  if (ctxDeleteEdge) ctxDeleteEdge.style.display = 'none';
  if (ctxExploreTransactions) ctxExploreTransactions.style.display = 'none';

  // New items
  ctxDeleteDomain.style.display = 'none';
  ctxDeleteDomainCascading.style.display = 'none';
  ctxRemoveGroup.style.display = 'none';
  ctxCopyGroup.style.display = 'none';
  ctxDeleteNodeAction.style.display = 'none';
  ctxConnectNodeAction.style.display = 'none';

  // Check selection
  const selection = graphManager.network.getSelection();
  if (selection.nodes.length > 1 && selection.nodes.includes(nodeId)) {
    // Multi-select context menu
    ctxRemoveGroup.style.display = 'flex';
    ctxCopyGroup.style.display = 'flex';
  } else {
    // Single-select context menu
    if (nodeData.type === 'domain') {
      ctxDeleteDomain.style.display = 'flex';
      ctxDeleteDomainCascading.style.display = 'flex';
    } else {
      // Parity with node actions panel
      ctxDeleteNodeAction.style.display = 'flex';
      ctxConnectNodeAction.style.display = 'flex';

      if (nodeData.type === 'user') {
        ctxExploreUser.style.display = 'flex';
        ctxAnalyzeUser.style.display = 'flex';
        ctxShowUserData.style.display = 'flex';

        // Update explore option: only for users with HWIDs
        const userNode = graphManager.getUserNodeById(nodeId);
        const hasHWID = userNode && userNode.hwids && userNode.hwids.length > 0;
        const isExploredUser = graphManager.isUserExplored(nodeId);

        if (hasHWID && !isExploredUser) {
          ctxExploreUser.classList.remove('disabled');
          ctxExploreUser.title = '';
        } else if (isExploredUser) {
          ctxExploreUser.classList.add('disabled');
          ctxExploreUser.title = 'Already explored';
        } else {
          ctxExploreUser.classList.add('disabled');
          ctxExploreUser.title = 'No HWID found for this user';
        }

        // Update analyze option: available for all users (context-only for non-HWID)
        if (isExploredUser || !hasHWID) {
          ctxAnalyzeUser.classList.remove('disabled');
          ctxAnalyzeUser.title = hasHWID ? '' : 'Context-only analysis (no HWID)';
        } else {
          ctxAnalyzeUser.classList.add('disabled');
          ctxAnalyzeUser.title = 'Explore user data first';
        }
      } else if (nodeData.type === 'user_detail') {
        // Enable social network info for username/email detail nodes
        ctxShowSocial.style.display = 'flex';
        // Check if this is a crypto wallet node (has wallet image or label matches crypto address regex)
        const isCryptoWallet = (nodeData.image && nodeData.image.includes('f7931a')) ||
          /^0x[a-fA-F0-9]{40}$/.test((nodeData.label || '').trim()) ||
          /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{39,59})$/.test((nodeData.label || '').trim()) ||
          /^(xpub|ypub|zpub|vpub|upub)[a-zA-Z0-9]{100,115}$/.test((nodeData.label || '').trim());
        if (isCryptoWallet && ctxExploreTransactions) {
          ctxExploreTransactions.style.display = 'flex';
          if (nodeData._cryptoExplored) {
            ctxExploreTransactions.classList.add('disabled');
            ctxExploreTransactions.title = 'Transactions already explored';
          } else {
            ctxExploreTransactions.classList.remove('disabled');
            ctxExploreTransactions.title = '';
          }
        }
      } else if (nodeData.type === 'crypto_address') {
        // Crypto destination address nodes also get the explore transactions button
        if (ctxExploreTransactions) {
          ctxExploreTransactions.style.display = 'flex';
          if (nodeData._cryptoExplored) {
            ctxExploreTransactions.classList.add('disabled');
            ctxExploreTransactions.title = 'Transactions already explored';
          } else {
            ctxExploreTransactions.classList.remove('disabled');
            ctxExploreTransactions.title = '';
          }
        }
      } else if (nodeData.type === 'user_detail_service') {
        // Enable social network info for any supported platform nodes
        const lbl = (nodeData.label || '').toLowerCase();
        if (lbl.includes('instagram') || lbl.includes('tiktok') || lbl.includes('pinterest') || lbl.includes('github') || lbl.includes('x') || lbl.includes('twitter') || lbl.includes('steam')) {
          ctxShowSocial.style.display = 'flex';
        }
      } else if (nodeData.type === 'superuser') {
        ctxAmplifySuperuser.style.display = 'flex';

        // Autopivot protection
        if (nodeData._autopivoted) {
          ctxAutopivotEmails.style.display = 'flex';
          ctxAutopivotEmails.classList.add('disabled');
          ctxAutopivotEmails.title = 'Autopivot already executed on this Superuser';
        } else {
          ctxAutopivotEmails.style.display = 'flex';
          ctxAutopivotEmails.classList.remove('disabled');
          ctxAutopivotEmails.title = '';
        }

        // Autopivot phones protection
        if (nodeData._autopivotedPhones) {
          ctxAutopivotPhones.style.display = 'flex';
          ctxAutopivotPhones.classList.add('disabled');
          ctxAutopivotPhones.title = 'Autopivot phones already executed on this Superuser';
        } else {
          ctxAutopivotPhones.style.display = 'flex';
          ctxAutopivotPhones.classList.remove('disabled');
          ctxAutopivotPhones.title = '';
        }

        ctxAnalyzeUser.style.display = 'flex';
        ctxShowUserData.style.display = 'flex';
        ctxShowAllSocial.style.display = 'flex';

        // Check if there are any hidden nested superusers descending from this one
        const nestedCheckEdges = graphManager.edgesDataset.get({
          filter: e => e.from === nodeId && (e.type === 'superuser-user' || e.type === 'superuser-new-user')
        });
        const hasHiddenNested = nestedCheckEdges.some(edge => {
          const uNodeRaw = graphManager.getUserNodeById(edge.to);
          if (uNodeRaw && uNodeRaw._superuserId) {
            const nestedSu = graphManager.nodesDataset.get(uNodeRaw._superuserId);
            return nestedSu && nestedSu.hidden;
          }
          return false;
        });
        ctxShowSupernode.style.display = hasHiddenNested ? 'flex' : 'none';
        // Style analyze shortcut differently for superusers
        const suNode = graphManager.getSuperuserNodeById(nodeId);
        if (suNode && suNode.aiAnalysis) {
          ctxAnalyzeUser.classList.add('disabled');
          ctxAnalyzeUser.title = 'Already analyzed locally';
        } else {
          ctxAnalyzeUser.classList.remove('disabled');
          ctxAnalyzeUser.title = '';
        }
      }
    }
  }

  // Position context menu
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';

  // Adjust position if menu goes off-screen
  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${y - rect.height}px`;
    }
  });
}

function hideContextMenu() {
  contextMenu.style.display = 'none';
  contextMenuTargetNode = null;
  contextMenuTargetEdge = null;
}

function handleEdgeContextMenu({ edgeId, x, y }) {
  contextMenuTargetEdge = edgeId;
  contextMenuTargetNode = null;

  // Hide user actions, show edge actions
  ctxExploreUser.style.display = 'none';
  ctxAnalyzeUser.style.display = 'none';
  ctxExploreIdentify.style.display = 'none';
  if (ctxDeleteEdge) ctxDeleteEdge.style.display = 'flex';

  // Position context menu
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.style.display = 'block';

  requestAnimationFrame(() => {
    const rect = contextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      contextMenu.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > window.innerHeight) {
      contextMenu.style.top = `${y - rect.height}px`;
    }
  });
}

// Function to show image modal
function showImagePreview(src) {
  if (imageModal && imageModalImg) {
    imageModalImg.src = src;
    imageModal.style.display = 'flex';
  }
}

// ===== Generic Node Popup (Double-Click) =====
function handleNodeDoubleClick(nodeId, nodeData) {
  if (!nodeData) return;
  const type = nodeData.type;

  // Show full screen image for posts
  if (type === 'social_post' && nodeData.image && nodeData.image.startsWith('http')) {
    showImagePreview(nodeData.image);
    return;
  }

  // ===== user_detail (email/username) — show all connected social networks =====
  if (type === 'user_detail') {
    const connectedEdges = graphManager.allEdgesData.filter(e =>
      e.from === nodeId || e.to === nodeId
    );
    const connectedPlatforms = [];
    for (const edge of connectedEdges) {
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
      if (otherNode && otherNode.type === 'user_detail_service') {
        connectedPlatforms.push(otherNode);
      }
    }

    // Find social_profile nodes connected to those platform nodes
    const profileNodes = [];
    for (const plat of connectedPlatforms) {
      const platEdges = graphManager.allEdgesData.filter(e =>
        e.from === plat.id || e.to === plat.id
      );
      for (const pe of platEdges) {
        const pId = pe.from === plat.id ? pe.to : pe.from;
        const pNode = graphManager.allNodesData.find(n => n.id === pId);
        if (pNode && pNode.type === 'social_profile') {
          profileNodes.push({ platform: plat.label, profile: pNode });
        }
      }
    }

    nodeModalTitle.textContent = `\uD83D\uDD17 ${nodeData.label} — Connected Networks`;
    nodeModalActionBtn.style.display = 'none';
    let html = '';

    if (connectedPlatforms.length === 0) {
      html = '<p style="color:#94a3b8;text-align:center;padding:20px;">No social networks connected to this node.</p>';
    } else {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot pink" style="background:var(--accent)"></span>CONNECTED SOCIAL NETWORKS</div>';
      html += '<div class="modal-detail-grid">';
      for (const plat of connectedPlatforms) {
        html += `<div class="modal-detail-item"><span class="label">Platform</span><span class="value">${plat.label}</span></div>`;
      }
      html += '</div></div>';

      for (const { platform, profile } of profileNodes) {
        const sd = (profile && profile.socialData) || {};
        html += '<div class="modal-section" style="margin-top:12px;">';
        html += `<div class="modal-section-title"><span class="dot green"></span>${platform} PROFILE</div>`;
        const picUrl = sd.profilePicUrlHD || sd.profilePicUrl;
        if (picUrl) {
          const proxyPic = `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(picUrl)}`;
          html += `<div style="display:flex;justify-content:center;margin-bottom:10px;"><img src="${proxyPic}" style="width:80px;height:80px;border-radius:50%;border:2px solid var(--accent-cyan);object-fit:cover;" onerror="this.style.display='none'"></div>`;
        }
        html += '<div class="modal-detail-grid">';
        [['Username', sd.username], ['Full Name', sd.fullName], ['Followers', sd.followersCount], ['Following', sd.followsCount], ['Posts', sd.postsCount], ['URL', sd.url]].forEach(([l, v]) => {
          if (v !== undefined && v !== null && v !== '') html += `<div class="modal-detail-item"><span class="label">${l}</span><span class="value">${v}</span></div>`;
        });
        if (sd.bio) html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Bio</span><span class="value" style="word-break:break-all;white-space:pre-wrap;">${sd.bio}</span></div>`;
        html += '</div></div>';
      }
    }

    nodeModalBody.innerHTML = html;
    nodeModalActionBtn.textContent = '';
    nodeModal.style.display = 'flex';
    return;
  }

  // ===== user_detail_service (social platform node) — show connection info =====
  if (type === 'user_detail_service') {
    const connectedEdges = graphManager.allEdgesData.filter(e =>
      e.from === nodeId || e.to === nodeId
    );
    let parentDetail = null;
    let socialProfile = null;
    for (const edge of connectedEdges) {
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
      if (otherNode) {
        if (otherNode.type === 'user_detail') parentDetail = otherNode;
        else if (otherNode.type === 'social_profile') socialProfile = otherNode;
      }
    }

    nodeModalTitle.textContent = `\uD83C\uDF10 ${nodeData.label} — Network Info`;
    nodeModalActionBtn.style.display = 'none';
    let html = '';
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot pink" style="background:var(--accent)"></span>CONNECTION INFO</div>';
    html += '<div class="modal-detail-grid">';
    html += `<div class="modal-detail-item"><span class="label">Platform</span><span class="value">${nodeData.label}</span></div>`;
    if (parentDetail) {
      const isEmail = parentDetail.label && parentDetail.label.includes('@');
      html += `<div class="modal-detail-item"><span class="label">${isEmail ? 'Email' : 'Username'}</span><span class="value">${parentDetail.label}</span></div>`;
    }
    html += '</div></div>';

    if (socialProfile && socialProfile.socialData) {
      const sd = socialProfile.socialData;
      html += '<div class="modal-section" style="margin-top:12px;">';
      html += '<div class="modal-section-title"><span class="dot green"></span>PROFILE DATA</div>';
      const picUrl = sd.profilePicUrlHD || sd.profilePicUrl;
      if (picUrl) {
        const proxyPic = `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(picUrl)}`;
        html += `<div style="display:flex;justify-content:center;margin-bottom:10px;"><img src="${proxyPic}" style="width:80px;height:80px;border-radius:50%;border:2px solid var(--accent-cyan);object-fit:cover;" onerror="this.style.display='none'"></div>`;
      }
      html += '<div class="modal-detail-grid">';
      [['Username', sd.username], ['Full Name', sd.fullName], ['Followers', sd.followersCount], ['Following', sd.followsCount], ['Posts', sd.postsCount], ['URL', sd.url], ['Blog URL', sd.blog], ['Location', sd.location], ['Email', sd.email], ['Twitter', sd.twitterUsername],
      ['Created', sd.createdAt ? new Date(sd.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''],
      ['Updated', sd.updatedAt ? new Date(sd.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''],
      ].forEach(([l, v]) => {
        if (v !== undefined && v !== null && v !== '') html += `<div class="modal-detail-item"><span class="label">${l}</span><span class="value">${v}</span></div>`;
      });
      if (sd.bio) html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Bio</span><span class="value" style="word-break:break-all;white-space:pre-wrap;">${sd.bio}</span></div>`;
      html += '</div></div>';
    }

    nodeModalBody.innerHTML = html;
    nodeModalActionBtn.textContent = '';
    nodeModal.style.display = 'flex';
    return;
  }

  // Set default action button style
  nodeModalActionBtn.style.display = 'none';
  nodeModalActionBtn.onclick = null;
  nodeModalActionBtn.textContent = '';

  let html = '';

  if (type === 'crypto_address') {
    // Fetch original node from allNodesData to access stored transaction data
    const origNode = graphManager.allNodesData.find(n => n.id === nodeId) || nodeData;
    const truncAddr = origNode.label && origNode.label.length > 16
      ? origNode.label.slice(0, 8) + '…' + origNode.label.slice(-6)
      : (origNode.label || '?');
    nodeModalTitle.textContent = `₿ Crypto account — ${truncAddr}`;
    nodeModalActionBtn.style.display = 'none';

    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot" style="background:#f7931a"></span>WALLET DETAILS</div>';
    html += '<div class="modal-detail-grid">';
    html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Full Address</span><span class="value" style="word-break:break-all;font-family:monospace;font-size:11px">${origNode.label || '—'} <i class="fas fa-copy" style="cursor:pointer;margin-left:6px;color:#94a3b8" title="Copy" onclick="navigator.clipboard.writeText('${origNode.label || ''}')"></i></span></div>`;
    if (origNode.provider) html += `<div class="modal-detail-item"><span class="label">Provider / Chain</span><span class="value">${origNode.provider}</span></div>`;
    if (origNode.cryptoNetwork) html += `<div class="modal-detail-item"><span class="label">Network</span><span class="value">${origNode.cryptoNetwork}</span></div>`;
    if (origNode.cryptoBalance !== undefined) {
      const unit = origNode._cryptoCurrency || (origNode.cryptoNetwork === 'EVM' ? 'ETH' : 'BTC');
      html += `<div class="modal-detail-item"><span class="label">Balance</span><span class="value" style="font-weight:600;color:${origNode.cryptoBalance > 0 ? '#f7931a' : '#64748b'}">${origNode.cryptoBalance.toFixed(6)} ${unit}</span></div>`;
    }
    if (origNode.txCount !== undefined) html += `<div class="modal-detail-item"><span class="label">Transactions</span><span class="value">${origNode.txCount}</span></div>`;
    if (origNode.totalReceived !== undefined) html += `<div class="modal-detail-item"><span class="label">Total Received</span><span class="value">${origNode.totalReceived.toFixed(6)}</span></div>`;
    if (origNode._cryptoExplored) html += '<div class="modal-detail-item"><span class="label">Status</span><span class="value" style="color:#50fa7b">✓ Explored</span></div>';
    html += '</div></div>';

    // Transaction history table
    const txs = origNode._cryptoTransactions || [];
    if (txs.length > 0) {
      const currency = origNode._cryptoCurrency || (origNode.cryptoNetwork === 'EVM' ? 'ETH' : 'BTC');
      const isEVM = origNode.cryptoNetwork === 'EVM';
      html += '<div class="modal-section" style="margin-top:12px">';
      html += `<div class="modal-section-title"><span class="dot" style="background:#f7931a"></span>LAST ${txs.length} TRANSACTIONS</div>`;
      html += '<div style="max-height:350px;overflow-y:auto;border:1px solid rgba(247,147,26,0.15);border-radius:8px">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:Inter,sans-serif">';
      html += '<thead style="position:sticky;top:0;background:#1e293b;z-index:1"><tr>';
      html += '<th style="padding:8px 10px;text-align:left;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">#</th>';
      html += `<th style="padding:8px 10px;text-align:left;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">${isEVM ? 'Hash' : 'TXID'}</th>`;
      if (isEVM) {
        html += '<th style="padding:8px 10px;text-align:left;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">To</th>';
        html += '<th style="padding:8px 10px;text-align:right;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">Value</th>';
        html += '<th style="padding:8px 10px;text-align:right;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">Date</th>';
      } else {
        html += '<th style="padding:8px 10px;text-align:left;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">Destinations</th>';
        html += '<th style="padding:8px 10px;text-align:right;color:#f7931a;font-weight:600;border-bottom:1px solid rgba(247,147,26,0.2)">Total Value</th>';
      }
      html += '</tr></thead><tbody>';

      txs.forEach((tx, idx) => {
        const bgColor = idx % 2 === 0 ? 'transparent' : 'rgba(247,147,26,0.03)';
        const txHash = isEVM ? (tx.hash || '—') : (tx.txid || '—');
        const shortHash = txHash.length > 14 ? txHash.slice(0, 6) + '…' + txHash.slice(-4) : txHash;

        if (isEVM) {
          const toAddr = tx.to ? (tx.to.slice(0, 6) + '…' + tx.to.slice(-4)) : '—';
          const val = tx.value !== undefined ? tx.value.toFixed(6) : '0';
          const date = tx.blockTimestamp ? new Date(tx.blockTimestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
          const copyBtn = `<i class="fas fa-copy" style="cursor:pointer;margin-left:5px;color:#64748b;font-size:9px;opacity:0.6" title="Copy" onmouseover="this.style.opacity=1;this.style.color='#f7931a'" onmouseout="this.style.opacity=0.6;this.style.color='#64748b'"></i>`;
          html += `<tr style="background:${bgColor}">`;
          html += `<td style="padding:6px 10px;color:#94a3b8;border-bottom:1px solid rgba(100,116,139,0.1)">${idx + 1}</td>`;
          html += `<td style="padding:6px 10px;color:#e2e8f0;font-family:monospace;border-bottom:1px solid rgba(100,116,139,0.1);white-space:nowrap" title="${txHash}">${shortHash}<span onclick="navigator.clipboard.writeText('${txHash}')" style="display:inline">${copyBtn}</span></td>`;
          html += `<td style="padding:6px 10px;color:#cbd5e1;font-family:monospace;border-bottom:1px solid rgba(100,116,139,0.1);white-space:nowrap" title="${tx.to || ''}">${toAddr}${tx.to ? `<span onclick="navigator.clipboard.writeText('${tx.to}')" style="display:inline">${copyBtn}</span>` : ''}</td>`;
          html += `<td style="padding:6px 10px;text-align:right;color:#e2e8f0;border-bottom:1px solid rgba(100,116,139,0.1)">${val} ${currency}</td>`;
          html += `<td style="padding:6px 10px;text-align:right;color:#94a3b8;border-bottom:1px solid rgba(100,116,139,0.1)">${date}</td>`;
          html += '</tr>';
        } else {
          const dests = tx.destinations || [];
          const totalVal = dests.reduce((sum, d) => sum + (d.value || 0), 0);
          const destsText = dests.length > 0
            ? dests.slice(0, 3).map(d => d.address ? d.address.slice(0, 6) + '…' + d.address.slice(-4) : '?').join(', ') + (dests.length > 3 ? ` +${dests.length - 3}` : '')
            : '—';
          const copyBtn = `<i class="fas fa-copy" style="cursor:pointer;margin-left:5px;color:#64748b;font-size:9px;opacity:0.6" title="Copy" onmouseover="this.style.opacity=1;this.style.color='#f7931a'" onmouseout="this.style.opacity=0.6;this.style.color='#64748b'"></i>`;
          const allDestsStr = dests.map(d => d.address).join(', ');
          html += `<tr style="background:${bgColor}">`;
          html += `<td style="padding:6px 10px;color:#94a3b8;border-bottom:1px solid rgba(100,116,139,0.1)">${idx + 1}</td>`;
          html += `<td style="padding:6px 10px;color:#e2e8f0;font-family:monospace;border-bottom:1px solid rgba(100,116,139,0.1);white-space:nowrap" title="${txHash}">${shortHash}<span onclick="navigator.clipboard.writeText('${txHash}')" style="display:inline">${copyBtn}</span></td>`;
          html += `<td style="padding:6px 10px;color:#cbd5e1;font-size:10px;border-bottom:1px solid rgba(100,116,139,0.1)" title="${allDestsStr}">${destsText}${dests.length > 0 ? `<span onclick="navigator.clipboard.writeText('${allDestsStr}')" style="display:inline">${copyBtn}</span>` : ''}</td>`;
          html += `<td style="padding:6px 10px;text-align:right;color:#e2e8f0;border-bottom:1px solid rgba(100,116,139,0.1)">${totalVal.toFixed(6)} ${currency}</td>`;
          html += '</tr>';
        }
      });

      html += '</tbody></table></div></div>';
    } else if (origNode._cryptoExplored) {
      html += '<div class="modal-section" style="margin-top:12px">';
      html += '<div class="modal-section-title"><span class="dot" style="background:#f7931a"></span>TRANSACTIONS</div>';
      html += '<p style="color:#94a3b8;text-align:center;padding:12px;font-size:12px">No transactions found for this address.</p>';
      html += '</div>';
    }

    nodeModalBody.innerHTML = html;
    nodeModal.style.display = 'flex';
    return;
  }

  if (type === 'social_profile') {
    // Bulletproof lookup: find the original node object in allNodesData to avoid vis.js DataSet stripping custom properties
    const originalNode = graphManager.allNodesData.find(n => n.id === nodeId);
    const sd = (originalNode && originalNode.socialData) || (nodeData && nodeData.socialData) || {};

    nodeModalTitle.textContent = `\uD83D\uDC64 Social Profile — ${sd.username || nodeData.label}`;

    // Profile picture at the top
    let picUrl = sd.profilePicUrlHD || sd.profilePicUrl;
    if (picUrl) {
      let proxyPicUrl = `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(picUrl)}`;
      html += `
        <div style="display:flex; justify-content:center; margin-bottom:16px;">
          <img src="${proxyPicUrl}" style="width:120px; height:120px; border-radius:50%; border:3px solid var(--accent-cyan); object-fit:cover; box-shadow:0 8px 16px rgba(0,212,255,0.2);"
               onerror="this.style.display='none'">
        </div>
      `;
    }

    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot pink" style="background:var(--accent)"></span>PROFILE INFORMATION</div>';
    html += '<div class="modal-detail-grid">';

    const isSteam = nodeId.split('_')[2] === 'steam';

    const displayProps = [
      ['Platform', nodeId.split('_')[2]],
      ['Username', sd.username],
      ['Full Name', sd.fullName],
      ['URL', sd.url],
      [isSteam ? 'Friends' : 'Followers', sd.followersCount],
      [isSteam ? 'Groups' : 'Following', isSteam ? sd.steamGroupsCount : sd.followsCount],
      ['Total Posts', sd.postsCount],
      ['Steam Level', sd.steamLevel],
      ['Recent Activity', sd.steamRecentActivity],
      ['Private Account', sd.private ? 'Yes' : 'No'],
      ['Verified', sd.verified ? 'Yes' : 'No'],
      ['Business Account', sd.isBusinessAccount ? 'Yes' : 'No'],
      ['Business Category', sd.businessCategoryName],
      ['Joined Recently', sd.joinedRecently ? 'Yes' : 'No'],
      // GitHub-specific fields (auto-filtered if empty)
      ['Blog URL', sd.blog],
      ['Location', sd.location],
      ['Email', sd.email],
      ['Twitter Username', sd.twitterUsername],
      ['Created Date', sd.createdAt ? new Date(sd.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''],
      ['Updated At', sd.updatedAt ? new Date(sd.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''],
    ];

    displayProps.forEach(([label, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        html += `<div class="modal-detail-item"><span class="label">${label}</span><span class="value">${value}</span></div>`;
      }
    });

    if (sd.steamAliases && sd.steamAliases.length > 0) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Known Aliases</span><span class="value" style="word-break:break-word;">${sd.steamAliases.join(' • ')}</span></div>`;
    }

    if (sd.bio) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Biography</span><span class="value" style="word-break:break-all;white-space:pre-wrap;">${sd.bio}</span></div>`;
    }

    html += '</div>';
    html += '</div>';

    // Check Profile URL button
    if (sd.url) {
      html += '<div class="modal-section" style="margin-top: 10px;">';
      html += `<button class="action-btn" style="width:100%; padding:8px; cursor:pointer; background:var(--accent-cyan-dim); border:1px solid var(--accent-cyan); border-radius:var(--radius-md); color:var(--accent-cyan); font-weight:600;" onclick="window.open('${sd.url}', '_blank');">Check Profile URL</button>`;
      html += '</div>';
    }

    // External URLs
    if (sd.externalUrls && sd.externalUrls.length > 0) {
      html += '<div class="modal-section" style="margin-top: 10px;">';
      html += '<div class="modal-section-title"><span class="dot green"></span>EXTERNAL LINKS</div>';
      html += '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';
      sd.externalUrls.forEach(url => {
        html += `<a href="${url}" target="_blank" style="font-size: 11px; color: var(--accent); text-decoration: none; padding: 2px 6px; border: 1px solid var(--accent); border-radius: 12px; background: rgba(0,200,255,0.05);">${url}</a>`;
      });
      html += '</div></div>';
    }

    nodeModalBody.innerHTML = html;
    nodeModal.style.display = 'flex';
    return;
  }

  if (type === 'superuser') {
    const superuser = graphManager.getSuperuserNodeById(nodeId);
    if (!superuser) return;

    const data = superuser.explorationData || {};
    const linkedUsers = superuser.linkedUserIds || [];
    const linkedEmails = superuser.linkedEmails || [];
    const allHwids = superuser.allHwids || [];

    // Title
    nodeModalTitle.textContent = `\uD83D\uDD17 Superuser — ${linkedUsers.length} linked users`;

    // AI Status section
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot blue"></span>ANALYSIS STATUS</div>';
    if (superuser.aiAnalysis) {
      const isPre = superuser.aiAnalysis.reasons && superuser.aiAnalysis.reasons.length > 0 && superuser.aiAnalysis.reasons[0].startsWith('Preanalysis result');
      const badgeText = isPre ? '✓ Pre Analyzed' : '✓ IA Analyzed';
      html += `<span class="modal-status-badge analyzed">${badgeText}</span>`;
      if (superuser.aiAnalysis.reasons && superuser.aiAnalysis.reasons.length > 0) {
        const displayStr = isPre ? superuser.aiAnalysis.reasons[0] : superuser.aiAnalysis.reasons.join(', ');
        html += `<p style="margin-top:8px;font-size:12px;color:var(--text-secondary)">${displayStr}</p>`;
      }
    } else {
      html += '<span class="modal-status-badge not-analyzed">Not analyzed</span>';
    }
    html += '</div>';

    // Identification Summary
    if (superuser.aiAnalysis && superuser.aiAnalysis.reasons && superuser.aiAnalysis.reasons.length > 0) {
      const reasons = superuser.aiAnalysis.reasons;
      const phoneStr = reasons.find(r => r.startsWith('Has phone number')) || 'Has phone number: No';
      const socialsMatch = reasons.find(r => r.startsWith('Has social accounts'));
      const socialsStr = socialsMatch || 'Has social accounts: No';
      const platforms = reasons.filter(r => r.startsWith('Platform '));

      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot purple"></span>IDENTIFICATION SUMMARY</div>';
      html += '<div class="modal-detail-grid">';
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Phone Number</span><span class="value">${phoneStr.replace('Has phone number: ', '')}</span></div>`;
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Social Accounts</span><span class="value">${socialsStr.replace('Has social accounts: ', '')}</span></div>`;
      html += '</div>';

      if (platforms.length > 0) {
        const uniquePlatforms = new Map();
        platforms.forEach(p => {
          const parts = p.match(/Platform \d+ (.*) - User: (.*) - Pass: (.*)/);
          if (parts && parts.length === 4) {
            const key = `${parts[1]}_${parts[2]}`;
            if (!uniquePlatforms.has(key)) {
              uniquePlatforms.set(key, { platform: parts[1], user: parts[2], pass: parts[3] });
            }
          }
        });
        const parsedPlatforms = Array.from(uniquePlatforms.values());
        parsedPlatforms.sort((a, b) => a.platform.localeCompare(b.platform, undefined, { sensitivity: 'base' }));

        html += '<table class="modal-cred-table" style="margin-top:10px;"><thead><tr><th class="sortable" data-col="0" style="cursor:pointer">Platform ↕</th><th class="sortable" data-col="1" style="cursor:pointer">User ↕</th><th class="sortable" data-col="2" style="cursor:pointer">Password ↕</th></tr></thead><tbody>';
        for (const p of parsedPlatforms) {
          html += `<tr><td>${p.platform}</td><td>${p.user}</td><td>${p.pass}</td></tr>`;
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    }

    // User Data section (Aggregate of Linked Users)
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot green"></span>USER DATA</div>';
    html += '<div class="modal-detail-grid">';

    const allUsernames = new Set();
    const allNames = new Set();
    const allPhones = new Set();
    for (const uid of linkedUsers) {
      const u = graphManager.getUserNodeById(uid);
      if (u) {
        if (u.username && u.username !== 'None') allUsernames.add(u.username);
        if (u.name && u.name !== 'None') allNames.add(u.name);
        if (u.phone && u.phone !== 'None') allPhones.add(u.phone);
      }
    }

    const emailStr = linkedEmails.length > 0 ? linkedEmails.join('<br>') : '<em style="color:var(--text-muted)">none</em>';
    html += `<div class="modal-detail-item"><span class="label">Emails</span><span class="value">${emailStr}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Usernames</span><span class="value">${allUsernames.size > 0 ? Array.from(allUsernames).join(', ') : 'None'}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Names</span><span class="value">${allNames.size > 0 ? Array.from(allNames).join(', ') : 'None'}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Phones</span><span class="value">${allPhones.size > 0 ? Array.from(allPhones).join(', ') : 'None'}</span></div>`;

    const superCountryStr = (data.country && data.country.length === 2) ? `<span class="fi fi-${data.country.toLowerCase()}" style="margin-right:4px;"></span>${data.country}` : (data.country || 'Unknown');
    html += `<div class="modal-detail-item"><span class="label">Country</span><span class="value">${superCountryStr}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Employee Status</span><span class="value">${superuser.isOrgSuperuser ? 'Internal Org' : 'External'}</span></div>`;
    html += '</div>';

    // --- Regex-extracted user data from email contexts ---
    const suEmailContexts = [];
    for (const uid of linkedUsers) {
      const u = graphManager.getUserNodeById(uid);
      if (u && u.emailContexts) suEmailContexts.push(...u.emailContexts);
    }
    const extractedData = extractUserDataFromContexts(suEmailContexts);
    if (extractedData) {
      html += '<div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">';
      html += '<div style="font-size:11px; font-weight:600; color:var(--accent); text-transform:uppercase; margin-bottom:8px;">Extracted from Contexts</div>';
      html += '<div class="modal-detail-grid">';
      const labelMap = { emails:'Emails', names:'Full Names', phones:'Phones', addresses:'Addresses', zipcodes:'Postal Codes', countries:'Countries', usernames:'Usernames', jobs:'Job Titles', companies:'Companies', genders:'Gender', birthdates:'Date of Birth', languages:'Languages' };
      for (const [key, label] of Object.entries(labelMap)) {
        if (extractedData[key] && extractedData[key].length > 0) {
          html += `<div class="modal-detail-item"><span class="label">${label}</span><span class="value">${extractedData[key].join(', ')}</span></div>`;
        }
      }
      html += '</div></div>';
    }
    html += '</div>';

    // Summary section
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot green"></span>SUMMARY</div>';
    html += '<div class="modal-detail-grid">';
    const countryStr = (data.country && data.country.length === 2) ? `<span class="fi fi-${data.country.toLowerCase()}" style="margin-right:4px;"></span>${data.country}` : (data.country || 'Unknown');
    html += `<div class="modal-detail-item"><span class="label">Country</span><span class="value">${countryStr}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Linked Users</span><span class="value">${linkedUsers.length}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">HWIDs</span><span class="value">${allHwids.length}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Credentials</span><span class="value">${(data.credentials || []).length}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Cookies</span><span class="value">${(data.cookies || []).length}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Log Date</span><span class="value">${data.logDate || 'Unknown'}</span></div>`;
    if (data.ftpInfo) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">FTP Info</span><span class="value" style="word-break:break-all">${data.ftpInfo}</span></div>`;
    }
    if (data.vpnInfo) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">VPN Info</span><span class="value" style="word-break:break-all">${data.vpnInfo}</span></div>`;
    }
    html += '</div>';
    html += '</div>';

    // Telegram Info section
    if (data.telegramData || data.telegramChats || data.telegramGroups) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot blue"></span>TELEGRAM INFO</div>';
      html += '<div class="modal-detail-grid">';

      if (data.telegramId) {
        html += `<div class="modal-detail-item"><span class="label">ID</span><span class="value">${data.telegramId}</span></div>`;
      }
      if (data.telegramPhone) {
        html += `<div class="modal-detail-item"><span class="label">Phone</span><span class="value">${data.telegramPhone}</span></div>`;
      }
      if (data.telegramData) {
        html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Raw Data</span><span class="value">${data.telegramData}</span></div>`;
      }
      html += '</div>';

      if (data.telegramGroups) {
        // The user wanted groups inside the telegram block
        html += `<div style="margin-top:10px;"><span class="label" style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Groups</span><div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:4px; font-size:12px; margin-top:4px;">${data.telegramGroups}</div></div>`;
      }

      if (data.telegramChats) {
        // Parse the block: ID 693745852 Spam Info Bot Username SpamBot Phone None ID 178220800 Millionaires Club... 
        let chatBlocks = data.telegramChats.split('ID ').filter(Boolean);
        // The first segment doesn't start with ID so it represents the user's own profile identity. Remove it from the table.
        if (!data.telegramChats.startsWith('ID ') && chatBlocks.length > 0) {
          chatBlocks.shift();
        }
        if (chatBlocks.length > 0) {
          html += '<table class="modal-cred-table" style="margin-top:10px;"><thead><tr><th>ID</th><th>Conversation Name</th><th>Username</th></tr></thead><tbody>';
          for (let i = 0; i < chatBlocks.length; i++) {
            let c = 'ID ' + chatBlocks[i];
            const style = i >= 5 ? 'display:none;' : '';
            const cls = i >= 5 ? 'su-chat-hidden' : '';
            // Robust Match: ID (number) (name of variable length) Username (username) Phone (number/None)
            const m = c.match(/ID\s+(\d+)\s+(.*?)\s+Username\s+(.*?)\s+Phone/i);
            if (m) {
              const cid = m[1];
              const cname = m[2].trim();
              const cuser = m[3].trim();
              html += `<tr class="${cls}" style="${style}"><td>${cid}</td><td>${cname}</td><td>${cuser !== 'None' ? cuser : '-'}</td></tr>`;
            } else {
              // Fallback for messy Telegram structures
              html += `<tr class="${cls}" style="${style}"><td colspan="3">${c}</td></tr>`;
            }
          }
          html += '</tbody></table>';
          if (chatBlocks.length > 5) {
            html += `<button class="load-more-btn" id="su-load-chats">Load all ${chatBlocks.length} conversations</button>`;
          }
        }
      }
      html += '</div>';
    }

    // CRIPTO INFO section
    {
      // Collect wallets from: 1) HWID source data, 2) PreAnalysis crypto scanning, 3) Credentials-based wallet detection
      const allCryptoWallets = [];

      // Source 1: Direct wallets from HWID data (stored in superuserData.wallets)
      if (data.wallets && data.wallets.length > 0) {
        for (const w of data.wallets) {
          if (!allCryptoWallets.find(cw => cw.address === w.address)) {
            allCryptoWallets.push({ provider: w.provider, address: w.address, source: 'HWID' });
          }
        }
      }

      // Source 2: Wallets detected from pre-analysis (context regex scan)
      if (superuser.aiAnalysis && superuser.aiAnalysis._cryptoWallets) {
        for (const w of superuser.aiAnalysis._cryptoWallets) {
          if (!allCryptoWallets.find(cw => cw.address === w.address)) {
            allCryptoWallets.push(w);
          }
        }
      }

      // Source 3: Wallet-related credentials (binance, coinbase, metamask, etc.)
      const WALLET_KEYWORDS = ['binance', 'coinbase', 'metamask', 'exodus', 'blockchain', 'bitcoin', 'ethereum', 'kraken', 'bybit', 'okx', 'crypto', 'wallet', 'ledger', 'trezor', 'phantom', 'solana'];
      if (data.credentials && data.credentials.length > 0) {
        for (const cred of data.credentials) {
          const url = (cred.URL || cred.url || '').toLowerCase();
          const user = (cred.USER || cred.user || '').trim();
          if (url && user && WALLET_KEYWORDS.some(kw => url.includes(kw))) {
            // Check if user field looks like a crypto address
            const isAddress = /^0x[0-9a-fA-F]{40}$/.test(user) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(user) || /^bc1[a-zA-HJ-NP-Z0-9]{39,59}$/.test(user);
            if (isAddress && !allCryptoWallets.find(cw => cw.address === user)) {
              allCryptoWallets.push({ provider: url.split('/')[0] || 'Exchange', address: user, source: 'credential' });
            } else if (!isAddress) {
              // It's a username/email for a crypto platform — still interesting
              if (!allCryptoWallets.find(cw => cw.address === user)) {
                const platformName = WALLET_KEYWORDS.find(kw => url.includes(kw)) || 'Exchange';
                allCryptoWallets.push({ provider: platformName.charAt(0).toUpperCase() + platformName.slice(1), address: user, source: 'credential' });
              }
            }
          }
        }
      }

      // Source 4: Scan email contexts for crypto addresses using regex
      const ctxWalletRegexes = {
        BTC: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
        BTC_Bech32: /\bbc1[a-zA-HJ-NP-Z0-9]{39,59}\b/g,
        ETH: /\b0x[0-9a-fA-F]{40}\b/g,
        LTC: /\bL[a-km-zA-HJ-NP-Z1-9]{26,33}\b/g,
        XMR: /\b4[0-9AB][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{93}\b/g,
        XRP: /\br[1-9A-HJ-NP-Za-km-z]{25,33}\b/g,
        DASH: /\bX[1-9A-HJ-NP-Za-km-z]{33}\b/g,
      };
      const allEmailContexts2 = [];
      for (const userId of linkedUsers) {
        const userNode = graphManager.getUserNodeById(userId);
        if (userNode && userNode.emailContexts) allEmailContexts2.push(...userNode.emailContexts);
      }
      for (const rawCtx of allEmailContexts2) {
        if (!rawCtx) continue;
        const ctxStr = String(rawCtx);
        for (const [chain, regex] of Object.entries(ctxWalletRegexes)) {
          regex.lastIndex = 0;
          let m;
          while ((m = regex.exec(ctxStr)) !== null) {
            const addr = m[0];
            if (!allCryptoWallets.find(cw => cw.address === addr)) {
              allCryptoWallets.push({ provider: chain, address: addr, source: 'context' });
            }
          }
        }
      }

      if (allCryptoWallets.length > 0) {
        html += '<div class="modal-section">';
        html += '<div class="modal-section-title"><span class="dot" style="background:#f7931a;"></span>CRIPTO INFO</div>';
        html += '<table class="modal-cred-table"><thead><tr><th>Provider / Chain</th><th>Address / User</th><th>Source</th></tr></thead><tbody>';
        for (const w of allCryptoWallets) {
          const copyIcon = `<i class="fas fa-copy copy-icon" data-copy="${w.address.replace(/"/g, '&quot;')}"></i>`;
          html += `<tr><td style="color:#f7931a;font-weight:600">${w.provider}</td><td style="word-break:break-all;font-family:monospace;font-size:11px;">${w.address}${copyIcon}</td><td style="color:var(--text-muted);font-size:10px;">${w.source || '-'}</td></tr>`;
        }
        html += '</tbody></table>';
        html += '</div>';
      }
    }

    // Email Contexts section
    const allEmailContexts = [];
    for (const userId of linkedUsers) {
      const userNode = graphManager.getUserNodeById(userId);
      if (userNode && userNode.emailContexts) {
        allEmailContexts.push(...userNode.emailContexts);
      }
    }

    if (allEmailContexts.length > 0) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot pink" style="background: #ff4081;"></span>EMAIL CONTEXT</div>';
      html += '<div style="font-size: 11px; margin-top: 8px; color: var(--text-primary); word-break: break-all; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">';

      const contextParts = [];
      for (const ctx of allEmailContexts) {
        try {
          const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
          const fields = [];
          if (parsed.firstname) fields.push(`Name: ${parsed.firstname} ${parsed.lastname || ''}`.trim());
          if (parsed.phone) fields.push(`Phone: ${parsed.phone}`);
          if (parsed.mobile) fields.push(`Mobile: ${parsed.mobile}`);
          if (parsed.city) fields.push(`City: ${parsed.city}`);
          if (parsed.country) fields.push(`Country: ${parsed.country}`);
          if (parsed.state) fields.push(`State: ${parsed.state}`);
          if (parsed.zip) fields.push(`Zip: ${parsed.zip}`);
          if (parsed.dob) fields.push(`DoB: ${parsed.dob}`);
          if (parsed.fax) fields.push(`Fax: ${parsed.fax}`);
          if (fields.length > 0) {
            contextParts.push(fields.join(' | '));
          } else {
            contextParts.push(ctx);
          }
        } catch (e) {
          contextParts.push(ctx);
        }
      }

      html += contextParts.join('<br><span style="color:var(--text-muted);">---</span><br>');
      html += '</div></div>';
    }

    // Amplified Information Section
    const hasAmplifiedUsernames = superuser.amplifiedInfo && superuser.amplifiedInfo.usernames && superuser.amplifiedInfo.usernames.length > 0;
    const hasAmplifiedEmails = superuser.amplifiedInfo && superuser.amplifiedInfo.emails && superuser.amplifiedInfo.emails.length > 0;

    if (hasAmplifiedUsernames || hasAmplifiedEmails) {
      html += '<div class="modal-section" style="border: 1px solid var(--accent); border-radius: 6px; padding: 8px;">';
      html += '<div class="modal-section-title""><span class="dot blue"></span>AMPLIFIED INFORMATION (OSINT)</div>';

      if (hasAmplifiedUsernames) {
        for (const res of superuser.amplifiedInfo.usernames) {
          html += `<div style="margin-bottom: 12px;">`;
          html += `<div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">User: <span style="color: var(--text-primary)">${res.username}</span></div>`;




          // Sherlock
          if (res.sherlock && res.sherlock.length > 0) {
            html += `<div style="margin-top: 6px;"><span class="label" style="display:inline-block; margin-bottom:2px;">Username registered domains:</span></div>`;
            html += `<div style="display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: rgba(0,0,0,0.1); border-radius: 4px;">`;
            for (const s of res.sherlock) {
              const sName = s.site;
              const urlStr = s.url;
              html += `<a href="${urlStr}" target="_blank" style="font-size: 11px; color: var(--accent); text-decoration: none; padding: 2px 6px; border: 1px solid var(--accent); border-radius: 12px; background: rgba(0,200,255,0.05);">${sName}</a>`;
            }
            html += `</div>`;
          }
          html += `</div>`;
        }
      }

      if (hasAmplifiedEmails) {
        for (const res of superuser.amplifiedInfo.emails) {
          html += `<div style="margin-bottom: 12px;">`;
          html += `<div style="font-weight: 600; font-size: 13px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;">Email: <span style="color: var(--text-primary)">${res.email}</span></div>`;

          // Holehe
          if (res.holehe && res.holehe.length > 0) {
            html += `<div style="margin-top: 6px;"><span class="label" style="display:inline-block; margin-bottom:2px;">Holehe (Email registrations):</span></div>`;
            html += `<table class="modal-cred-table" style="font-size: 11px; margin-bottom: 8px;">`;
            html += `<thead><tr><th>Service</th><th>EmailRecovery</th><th>PhoneNumber</th><th>Others</th></tr></thead><tbody>`;
            for (const h of res.holehe) {
              const emailRec = h.emailrecovery || '-';
              const phoneNum = h.phoneNumber || '-';
              const others = h.others ? JSON.stringify(h.others) : '-';
              html += `<tr><td style="color: var(--text-primary)">${h.name}</td><td>${emailRec}</td><td>${phoneNum}</td><td>${others}</td></tr>`;
            }
            html += `</tbody></table>`;
          }
          html += `</div>`;
        }
      }
      html += '</div>';
    }

    // Linked Emails
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot amber"></span>LINKED EMAILS</div>';
    html += '<div class="modal-tag-list">';
    for (const email of linkedEmails) {
      const isOrg = superuser.isOrgSuperuser && email.includes('@');
      html += `<span class="modal-tag${isOrg ? ' highlight' : ''}">${email}</span>`;
    }
    if (linkedEmails.length === 0) html += '<span style="color:var(--text-muted);font-size:12px">No emails</span>';
    html += '</div></div>';

    // HWIDs
    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot"></span>HWID FILES</div>';
    html += '<div class="modal-tag-list">';

    let hwidsRendered = 0;
    for (let i = 0; i < allHwids.length; i++) {
      let hwid = allHwids[i];
      if (!hwid) continue; // skip raw linebreaks here since we format natively

      const isHeader = hwid.startsWith('HWIDs from');

      // If header, clean up dangling colons for standard look
      if (isHeader) {
        if (!hwid.endsWith(':')) hwid += ':';

        // Peek ahead to see if the next valid item is another header or EOF
        let nextIsHeaderOrEOF = true;
        for (let j = i + 1; j < allHwids.length; j++) {
          if (allHwids[j]) {
            nextIsHeaderOrEOF = allHwids[j].startsWith('HWIDs from');
            break;
          }
        }

        // Only draw the title if actual HWIDs exist beneath it
        if (!nextIsHeaderOrEOF) {
          html += `<div style="width: 100%; margin-top: 10px; margin-bottom: 4px; font-size: 13px; font-weight: 600; color: var(--text-primary);">${hwid}</div>`;
        }
      } else {
        const style = hwidsRendered >= 20 ? 'display:none;' : '';
        const cls = hwidsRendered >= 20 ? 'su-hwid-hidden' : '';
        html += `<span class="modal-tag ${cls}" style="${style}">${hwid}</span>`;
        hwidsRendered++;
      }
    }
    html += '</div>';
    if (hwidsRendered > 20) {
      html += `<button class="load-more-btn" id="su-load-hwids">Load all ${hwidsRendered} HWID files</button>`;
    }
    html += '</div>';

    // Credentials table
    if (data.credentials && data.credentials.length > 0) {
      // Deduplicate credentials
      const uniqueCredsMap = new Map();
      for (const cred of data.credentials) {
        const url = cred.URL || cred.url || '-';
        const user = cred.USER || cred.user || '-';
        const pass = cred.PASS || cred.pass || cred.PASSWORD || cred.password || '-';
        const key = `${url}_${user}_${pass}`;
        if (!uniqueCredsMap.has(key)) {
          uniqueCredsMap.set(key, { url, user, pass });
        }
      }
      const uniqueCreds = Array.from(uniqueCredsMap.values());

      html += '<div class="modal-section">';
      html += `<div class="modal-section-title"><span class="dot red"></span>CREDENTIALS (${uniqueCreds.length})</div>`;
      html += '<table class="modal-cred-table"><thead><tr><th>URL</th><th>User</th><th>Password</th></tr></thead><tbody>';
      for (let i = 0; i < uniqueCreds.length; i++) {
        const cred = uniqueCreds[i];
        const style = i >= 20 ? 'display:none;' : '';
        const cls = i >= 20 ? 'su-cred-hidden' : '';
        const urlCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.url.replace(/"/g, '&quot;')}"></i>`;
        const userCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.user.replace(/"/g, '&quot;')}"></i>`;
        const passCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.pass.replace(/"/g, '&quot;')}"></i>`;
        html += `<tr class="${cls}" style="${style}"><td>${cred.url}${urlCopy}</td><td>${cred.user}${userCopy}</td><td>${cred.pass}${passCopy}</td></tr>`;
      }
      html += '</tbody></table>';
      if (uniqueCreds.length > 20) {
        html += `<button class="load-more-btn" id="su-load-creds">Load all ${uniqueCreds.length} credentials</button>`;
      }
      html += '</div>';
    }

    // Cookie domains
    if (data.cookies && data.cookies.length > 0) {
      html += '<div class="modal-section">';
      html += `<div class="modal-section-title"><span class="dot amber"></span>COOKIE DOMAINS (${data.cookies.length})</div>`;
      html += '<div class="modal-tag-list">';
      for (let i = 0; i < data.cookies.length; i++) {
        const cookie = data.cookies[i];
        const style = i >= 30 ? 'display:none;' : '';
        const cls = i >= 30 ? 'su-cookie-hidden' : '';
        html += `<span class="modal-tag ${cls}" style="${style}">${cookie}</span>`;
      }
      html += '</div>';
      if (data.cookies.length > 30) {
        html += `<button class="load-more-btn" id="su-load-cookies">Load all ${data.cookies.length} cookies</button>`;
      }
      html += '</div>';
    }

    // Action button
    nodeModalActionBtn.style.display = 'flex';
    nodeModalActionBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
        <path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" stroke-width="1.2" fill="none" />
      </svg>
      Deep AI Analysis
    `;
    nodeModalActionBtn.onclick = () => handleAnalyzeSuperuser(nodeId);

  } else if (type === 'domain') {
    if (nodeData.isHub) {
      nodeModalTitle.textContent = `✉️ Email — ${nodeData.label}`;
    } else {
      nodeModalTitle.textContent = `\uD83C\uDF10 Domain — ${nodeData.label}`;
    }

    // Dynamically calculate counts based on actual edges in graph layer
    const connectedEdges = graphManager.allEdgesData.filter(e => e.from === nodeId || e.to === nodeId);
    let usersCount = 0;
    let servicesCount = 0;

    for (const edge of connectedEdges) {
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
      if (otherNode && !otherNode.deleted) {
        if (otherNode.type === 'user') usersCount++;
        if (otherNode.type === 'service') servicesCount++;
      }
    }

    html += '<div class="modal-section">';
    if (nodeData.isHub) {
      html += '<div class="modal-section-title"><span class="dot pink" style="background:var(--accent)"></span>EMAIL DATA</div>';
    } else {
      html += '<div class="modal-section-title"><span class="dot blue"></span>DOMAIN DATA</div>';
    }

    html += '<div class="modal-detail-grid">';
    html += `<div class="modal-detail-item"><span class="label">Hostnames Found</span><span class="value">${servicesCount}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Related Users</span><span class="value">${usersCount}</span></div>`;
    html += '</div></div>';

    if (nodeData.sources && nodeData.sources.size > 0) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot green"></span>SOURCES</div>';
      html += '<div class="modal-tag-list">';
      for (const source of nodeData.sources) {
        html += `<span class="modal-tag">${source}</span>`;
      }
      html += '</div></div>';
    }

  } else if (type === 'service') {
    nodeModalTitle.textContent = `\uD83D\uDDA5 Service — ${nodeData.label}`;

    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot green"></span>SERVICE DATA</div>';
    html += '<div class="modal-detail-grid">';
    html += `<div class="modal-detail-item"><span class="label">Hostname</span><span class="value">${nodeData.hostname || nodeData.label}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Linked Domain</span><span class="value">${nodeData.mainDomain || 'None'}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Credentials</span><span class="value">${nodeData.credentialsFound || 0}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Users</span><span class="value">${nodeData.usersCount || 0}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Data Source</span><span class="value">${nodeData.sourceType || 'Unknown'}</span></div>`;
    html += '</div></div>';

    if (nodeData.sources && nodeData.sources.size > 0) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot green"></span>INTELLIGENCE SOURCES</div>';
      html += '<div class="modal-tag-list">';
      for (const source of nodeData.sources) {
        html += `<span class="modal-tag">${source}</span>`;
      }
      html += '</div></div>';
    }

  } else if (type === 'user') {
    const userIcon = nodeData.isOrgEmail ? '✓ ' : '';
    nodeModalTitle.textContent = `\uD83D\uDC64 User — ${userIcon}${nodeData.name || nodeData.email || nodeData.label}`;

    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot blue"></span>ANALYSIS STATUS</div>';
    if (nodeData.aiAnalysis) {
      const isPre = nodeData.aiAnalysis.reasons && nodeData.aiAnalysis.reasons.length > 0 && nodeData.aiAnalysis.reasons[0].startsWith('Preanalysis result');
      const badgeText = isPre ? '✓ Pre Analyzed' : '✓ IA Analyzed';
      html += `<span class="modal-status-badge analyzed">${badgeText}</span>`;
      if (nodeData.aiAnalysis.reasons && nodeData.aiAnalysis.reasons.length > 0) {
        const displayStr = isPre ? nodeData.aiAnalysis.reasons[0] : nodeData.aiAnalysis.reasons.join(', ');
        html += `<p style="margin-top:8px;font-size:12px;color:var(--text-secondary)">${displayStr}</p>`;
      }
    } else {
      html += '<span class="modal-status-badge not-analyzed">Not analyzed</span>';
    }
    html += '</div>';

    // Identification Summary
    if (nodeData.aiAnalysis && nodeData.aiAnalysis.reasons && nodeData.aiAnalysis.reasons.length > 0) {
      const reasons = nodeData.aiAnalysis.reasons;
      const phoneStr = reasons.find(r => r.startsWith('Has phone number')) || 'Has phone number: No';
      const socialsMatch = reasons.find(r => r.startsWith('Has social accounts'));
      const socialsStr = socialsMatch || 'Has social accounts: No';
      const platforms = reasons.filter(r => r.startsWith('Platform '));

      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot purple"></span>IDENTIFICATION SUMMARY</div>';
      html += '<div class="modal-detail-grid">';
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Phone Number</span><span class="value">${phoneStr.replace('Has phone number: ', '')}</span></div>`;
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Social Accounts</span><span class="value">${socialsStr.replace('Has social accounts: ', '')}</span></div>`;
      html += '</div>';

      if (platforms.length > 0) {
        const uniquePlatforms = new Map();
        platforms.forEach(p => {
          const parts = p.match(/Platform \d+ (.*) - User: (.*) - Pass: (.*)/);
          if (parts && parts.length === 4) {
            const key = `${parts[1]}_${parts[2]}`;
            if (!uniquePlatforms.has(key)) {
              uniquePlatforms.set(key, { platform: parts[1], user: parts[2], pass: parts[3] });
            }
          }
        });
        const parsedPlatforms = Array.from(uniquePlatforms.values());
        parsedPlatforms.sort((a, b) => a.platform.localeCompare(b.platform, undefined, { sensitivity: 'base' }));

        html += '<table class="modal-cred-table" style="margin-top:10px;"><thead><tr><th class="sortable" data-col="0" style="cursor:pointer">Platform ↕</th><th class="sortable" data-col="1" style="cursor:pointer">User ↕</th><th class="sortable" data-col="2" style="cursor:pointer">Password ↕</th></tr></thead><tbody>';
        for (const p of parsedPlatforms) {
          html += `<tr><td>${p.platform}</td><td>${p.user}</td><td>${p.pass}</td></tr>`;
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    }

    html += '<div class="modal-section">';
    html += '<div class="modal-section-title"><span class="dot green"></span>USER DATA</div>';
    html += '<div class="modal-detail-grid">';
    const userEmailStr = (nodeData.email && nodeData.email.includes('@')) ? nodeData.email : '<em style="color:var(--text-muted)">none</em>';
    html += `<div class="modal-detail-item"><span class="label">Email</span><span class="value">${userEmailStr}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Username</span><span class="value">${nodeData.username || 'None'}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Name</span><span class="value">${nodeData.name || 'None'}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Phone</span><span class="value">${nodeData.phone || 'None'}</span></div>`;
    const userCountryStr = (nodeData.country && nodeData.country.length === 2) ? `<span class="fi fi-${nodeData.country.toLowerCase()}" style="margin-right:4px;"></span>${nodeData.country}` : (nodeData.country || 'Unknown');
    html += `<div class="modal-detail-item"><span class="label">Country</span><span class="value">${userCountryStr}</span></div>`;
    html += `<div class="modal-detail-item"><span class="label">Employee Status</span><span class="value">${nodeData.isOrgEmail ? 'Internal Org' : 'External'}</span></div>`;
    const data = nodeData._explorationData || {};

    if (data.ftpInfo) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">FTP Info</span><span class="value" style="word-break:break-all">${data.ftpInfo}</span></div>`;
    }
    if (data.vpnInfo) {
      html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">VPN Info</span><span class="value" style="word-break:break-all">${data.vpnInfo}</span></div>`;
    }
    html += '</div>';

    // --- Regex-extracted user data from email contexts ---
    if (nodeData.emailContexts && nodeData.emailContexts.length > 0) {
      const userExtractedData = extractUserDataFromContexts(nodeData.emailContexts);
      if (userExtractedData) {
        html += '<div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">';
        html += '<div style="font-size:11px; font-weight:600; color:var(--accent); text-transform:uppercase; margin-bottom:8px;">Extracted from Contexts</div>';
        html += '<div class="modal-detail-grid">';
        const labelMap = { emails:'Emails', names:'Full Names', phones:'Phones', addresses:'Addresses', zipcodes:'Postal Codes', countries:'Countries', usernames:'Usernames', jobs:'Job Titles', companies:'Companies', genders:'Gender', birthdates:'Date of Birth', languages:'Languages' };
        for (const [key, label] of Object.entries(labelMap)) {
          if (userExtractedData[key] && userExtractedData[key].length > 0) {
            html += `<div class="modal-detail-item"><span class="label">${label}</span><span class="value">${userExtractedData[key].join(', ')}</span></div>`;
          }
        }
        html += '</div></div>';
      }
    }
    html += '</div>';

    // Telegram Info section
    if (data.telegramData || data.telegramChats || data.telegramGroups) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot blue"></span>TELEGRAM INFO</div>';
      html += '<div class="modal-detail-grid">';
      if (data.telegramId) {
        html += `<div class="modal-detail-item"><span class="label">ID</span><span class="value">${data.telegramId}</span></div>`;
      }
      if (data.telegramPhone) {
        html += `<div class="modal-detail-item"><span class="label">Phone</span><span class="value">${data.telegramPhone}</span></div>`;
      }
      if (data.telegramData) {
        html += `<div class="modal-detail-item" style="grid-column:1/-1"><span class="label">Raw Data</span><span class="value">${data.telegramData}</span></div>`;
      }
      html += '</div>';

      if (data.telegramGroups) {
        html += `<div style="margin-top:10px;"><span class="label" style="font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase;">Groups</span><div style="background:rgba(0,0,0,0.2); padding:6px; border-radius:4px; font-size:12px; margin-top:4px;">${data.telegramGroups}</div></div>`;
      }

      if (data.telegramChats) {
        let chatBlocks = data.telegramChats.split('ID ').filter(Boolean);
        if (!data.telegramChats.startsWith('ID ') && chatBlocks.length > 0) {
          chatBlocks.shift();
        }
        if (chatBlocks.length > 0) {
          html += '<table class="modal-cred-table" style="margin-top:10px;"><thead><tr><th>ID</th><th>Conversation Name</th><th>Username</th></tr></thead><tbody>';
          for (let i = 0; i < chatBlocks.length; i++) {
            let c = 'ID ' + chatBlocks[i];
            const style = i >= 5 ? 'display:none;' : '';
            const cls = i >= 5 ? 'usr-chat-hidden' : '';
            const m = c.match(/ID\s+(\d+)\s+(.*?)\s+Username\s+(.*?)\s+Phone/i);
            if (m) {
              const cid = m[1];
              const cname = m[2].trim();
              const cuser = m[3].trim();
              html += `<tr class="${cls}" style="${style}"><td>${cid}</td><td>${cname}</td><td>${cuser !== 'None' ? cuser : '-'}</td></tr>`;
            } else {
              html += `<tr class="${cls}" style="${style}"><td colspan="3">${c}</td></tr>`;
            }
          }
          html += '</tbody></table>';
          if (chatBlocks.length > 5) {
            html += `<button class="load-more-btn" id="usr-load-chats">Load all ${chatBlocks.length} conversations</button>`;
          }
        }
      }
      html += '</div>';
    }


    const allHwids = (nodeData.hwids || []).map(h => h.filename);
    const hasHWID = allHwids.length > 0 || (nodeData.rawData && nodeData.rawData.some(r => r.Filename || r.filename || r.search_term?.match(/HWID/i)));

    if (hasHWID && allHwids.length > 0) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot"></span>HWID FILES</div>';
      html += '<div class="modal-tag-list">';
      for (let i = 0; i < allHwids.length; i++) {
        const hwid = allHwids[i];
        const style = i >= 20 ? 'display:none;' : '';
        const cls = i >= 20 ? 'usr-hwid-hidden' : '';
        html += `<span class="modal-tag ${cls}" style="${style}">${hwid}</span>`;
      }
      html += '</div>';
      if (allHwids.length > 20) {
        html += `<button class="load-more-btn" id="usr-load-hwids">Load all ${allHwids.length} HWID files</button>`;
      }
      html += '</div>';
    } else if (hasHWID) {
      html += '<p style="margin: 10px 0; font-size:12px; color:var(--text-muted)"><em>HWID records detected but unexplored. Run Explore User Data to aggregate context.</em></p>';
    }

    if (data.credentials && data.credentials.length > 0) {
      const uniqueCredsMap = new Map();
      for (const cred of data.credentials) {
        const url = cred.URL || cred.url || '-';
        const user = cred.USER || cred.user || '-';
        const pass = cred.PASS || cred.pass || cred.PASSWORD || cred.password || '-';
        const key = `${url}_${user}_${pass}`;
        if (!uniqueCredsMap.has(key)) {
          uniqueCredsMap.set(key, { url, user, pass });
        }
      }
      const uniqueCreds = Array.from(uniqueCredsMap.values());

      html += '<div class="modal-section">';
      html += `<div class="modal-section-title"><span class="dot red"></span>CREDENTIALS (${uniqueCreds.length})</div>`;
      html += '<table class="modal-cred-table"><thead><tr><th>URL</th><th>User</th><th>Password</th></tr></thead><tbody>';
      for (let i = 0; i < uniqueCreds.length; i++) {
        const cred = uniqueCreds[i];
        const style = i >= 20 ? 'display:none;' : '';
        const cls = i >= 20 ? 'usr-cred-hidden' : '';
        const urlCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.url.replace(/"/g, '&quot;')}"></i>`;
        const userCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.user.replace(/"/g, '&quot;')}"></i>`;
        const passCopy = `<i class="fas fa-copy copy-icon" data-copy="${cred.pass.replace(/"/g, '&quot;')}"></i>`;
        html += `<tr class="${cls}" style="${style}"><td>${cred.url}${urlCopy}</td><td>${cred.user}${userCopy}</td><td>${cred.pass}${passCopy}</td></tr>`;
      }
      html += '</tbody></table>';
      if (uniqueCreds.length > 20) {
        html += `<button class="load-more-btn" id="usr-load-creds">Load all ${uniqueCreds.length} credentials</button>`;
      }
      html += '</div>';
    }

    // Cookie domains
    if (data.cookies && data.cookies.length > 0) {
      html += '<div class="modal-section">';
      html += `<div class="modal-section-title"><span class="dot amber"></span>COOKIE DOMAINS (${data.cookies.length})</div>`;
      html += '<div class="modal-tag-list">';
      for (let i = 0; i < data.cookies.length; i++) {
        const cookie = data.cookies[i];
        const style = i >= 30 ? 'display:none;' : '';
        const cls = i >= 30 ? 'usr-cookie-hidden' : '';
        html += `<span class="modal-tag ${cls}" style="${style}">${cookie}</span>`;
      }
      html += '</div>';
      if (data.cookies.length > 30) {
        html += `<button class="load-more-btn" id="usr-load-cookies">Load all ${data.cookies.length} cookies</button>`;
      }
      html += '</div>';
    }

    // Email Contexts section
    if (nodeData.emailContexts && nodeData.emailContexts.length > 0) {
      html += '<div class="modal-section">';
      html += '<div class="modal-section-title"><span class="dot pink" style="background: #ff4081;"></span>EMAIL CONTEXT</div>';
      html += '<div style="font-size: 11px; margin-top: 8px; color: var(--text-primary); word-break: break-all; max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 4px;">';

      const contextParts = [];
      for (const ctx of nodeData.emailContexts) {
        try {
          const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
          const fields = [];
          if (parsed.firstname) fields.push(`Name: ${parsed.firstname} ${parsed.lastname || ''}`.trim());
          if (parsed.phone) fields.push(`Phone: ${parsed.phone}`);
          if (parsed.mobile) fields.push(`Mobile: ${parsed.mobile}`);
          if (parsed.city) fields.push(`City: ${parsed.city}`);
          if (parsed.country) fields.push(`Country: ${parsed.country}`);
          if (parsed.state) fields.push(`State: ${parsed.state}`);
          if (parsed.zip) fields.push(`Zip: ${parsed.zip}`);
          if (parsed.dob) fields.push(`DoB: ${parsed.dob}`);
          if (parsed.fax) fields.push(`Fax: ${parsed.fax}`);
          if (fields.length > 0) {
            contextParts.push(fields.join(' | '));
          } else {
            contextParts.push(ctx);
          }
        } catch (e) {
          contextParts.push(ctx);
        }
      }

      html += contextParts.join('<br><span style="color:var(--text-muted);">---</span><br>');
      html += '</div></div>';
    }

    // Action button
    nodeModalActionBtn.style.display = 'flex';
    if (!graphManager.isUserExplored(nodeId) && hasHWID) {
      nodeModalActionBtn.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5" />
          <path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Explore User Data
      `;
      nodeModalActionBtn.onclick = () => {
        nodeModal.style.display = 'none';
        handleExploreUserData(nodeId);
      };
    } else {
      nodeModalActionBtn.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
          <path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" stroke-width="1.2" fill="none" />
        </svg>
        Deep AI Analysis
      `;
      nodeModalActionBtn.onclick = () => {
        nodeModal.style.display = 'none';
        handleAnalyzeUserAI(nodeId);
      };
    }
  }

  nodeModalBody.innerHTML = html;

  // Bind sortable columns
  const sortableHeaders = nodeModalBody.querySelectorAll('th.sortable');
  sortableHeaders.forEach(th => {
    th.onclick = (e) => {
      e.stopPropagation();
      const table = th.closest('table');
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const colIndex = parseInt(th.getAttribute('data-col'), 10);
      const isAsc = th.classList.contains('asc');

      rows.sort((a, b) => {
        const aText = a.children[colIndex].textContent.trim();
        const bText = b.children[colIndex].textContent.trim();
        return isAsc ? bText.localeCompare(aText, undefined, { numeric: true }) : aText.localeCompare(bText, undefined, { numeric: true });
      });

      table.querySelectorAll('th.sortable').forEach(h => h.classList.remove('asc', 'desc'));
      th.classList.toggle('asc', !isAsc);
      th.classList.toggle('desc', isAsc);

      tbody.append(...rows);
    };
  });

  // Bind copy icons
  const copyIcons = nodeModalBody.querySelectorAll('.copy-icon');
  copyIcons.forEach(icon => {
    icon.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(icon.getAttribute('data-copy')).then(() => {
        showToast('Copied to clipboard', 'success');
      }).catch(err => {
        console.error('Failed to copy: ', err);
      });
    };
  });

  // Bind load more buttons
  const bindLoadMore = (btnId, hiddenClass, displayStyle = '') => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        const hiddenItems = nodeModalBody.querySelectorAll(`.${hiddenClass}`);
        hiddenItems.forEach(item => {
          item.style.display = displayStyle;
        });
        btn.style.display = 'none';
      };
    }
  };

  bindLoadMore('su-load-hwids', 'su-hwid-hidden', 'inline-block');
  bindLoadMore('su-load-creds', 'su-cred-hidden', 'table-row');
  bindLoadMore('su-load-cookies', 'su-cookie-hidden', 'inline-block');
  bindLoadMore('su-load-chats', 'su-chat-hidden', 'table-row');
  bindLoadMore('usr-load-hwids', 'usr-hwid-hidden', 'inline-block');
  bindLoadMore('usr-load-creds', 'usr-cred-hidden', 'table-row');
  bindLoadMore('usr-load-chats', 'usr-chat-hidden', 'table-row');
  bindLoadMore('usr-load-cookies', 'usr-cookie-hidden', 'inline-block');

  // Show modal
  nodeModal.style.display = 'flex';

  // Bind events
  nodeModalClose.onclick = () => { nodeModal.style.display = 'none'; };
  nodeModal.onclick = (e) => {
    if (e.target === nodeModal) nodeModal.style.display = 'none';
  };
}

// ===== Deep AI Analysis for Superuser =====
async function handleAnalyzeSuperuser(superuserId) {
  const superuser = graphManager.getSuperuserNodeById(superuserId);
  if (!superuser) {
    showToast('Superuser not found', 'error');
    return;
  }

  // Determine superuser number for display
  const superuserIndex = superuserId.replace('superuser_', '');

  // Keep modal open and show progress inside it
  nodeModalActionBtn.disabled = true;
  nodeModalActionBtn.textContent = 'Analyzing...';
  nodeModalClose.style.display = 'none';

  // Show progress in modal body with Minimize button
  nodeModalBody.innerHTML = `
    <div style="text-align:center;padding:40px 20px;">
      <div class="modal-analyzing-spinner"></div>
      <p style="margin-top:16px;font-size:14px;color:var(--text-primary);font-weight:600;">Analyzing superuser #${superuserIndex}...</p>
      <p id="superuser-analysis-status" style="margin-top:8px;font-size:12px;color:var(--text-secondary);">Preparing data for AI analysis...</p>
      <button id="superuser-minimize-btn" class="modal-minimize-btn" style="margin:16px auto 0;">
        <svg viewBox="0 0 20 20" fill="none" width="14" height="14"><path d="M4 14h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        Minimize
      </button>
    </div>
  `;

  // Disable clicking overlay to close
  nodeModal.onclick = null;

  // Minimize button handler
  let isMinimized = false;
  document.getElementById('superuser-minimize-btn').onclick = () => {
    isMinimized = true;
    nodeModal.style.display = 'none';
    floatingAnalysisStatus.style.display = 'flex';
    floatingAnalysisText.textContent = `Analyzing superuser #${superuserIndex} in progress`;
  };

  // Start blinking the superuser triangle
  graphManager.startNodeBlink(superuserId);

  const statusEl = document.getElementById('superuser-analysis-status');
  const data = superuser.explorationData || {};
  const linkedEmails = superuser.linkedEmails || [];

  // Aggregate all email contexts from linked users
  const allEmailContexts = [];
  for (const userId of superuser.linkedUserIds || []) {
    const userNode = graphManager.getUserNodeById(userId);
    if (userNode && userNode.emailContexts) {
      allEmailContexts.push(...userNode.emailContexts);
    }
  }

  if (statusEl) statusEl.textContent = 'Building context and sending to AI...';

  // Build a synthetic user-like object compatible with analyzeSingleUser
  const syntheticUser = {
    id: superuserId,
    type: 'user',
    email: linkedEmails[0] || 'superuser',
    username: linkedEmails.length > 1 ? linkedEmails.slice(1).join(', ') : '',
    name: '',
    phone: '',
    label: `Superuser (${linkedEmails.length} emails)`,
    isOrgEmail: superuser.isOrgSuperuser,
    emailContexts: allEmailContexts,
    rawData: [],
    _explorationData: {
      cookies: data.cookies || [],
      credentials: data.credentials || [],
      ftpInfo: data.ftpInfo || null,
      country: data.country || null,
      logDate: data.logDate || null,
      searchTerms: data.searchTerms || [],
    },
    searchTermIds: data.searchTerms || [],
  };

  try {
    if (statusEl) statusEl.textContent = 'Waiting for AI response...';

    const result = await analyzeSingleUser(syntheticUser, (id, identifiable, reasons, evidence, possibleIdentifiable) => {
      const existingCryptoWallets = superuser.aiAnalysis?._cryptoWallets || [];
      superuser.aiAnalysis = {
        identifiable,
        possibleIdentifiable,
        reasons: reasons || [],
        evidence: evidence || [],
        _cryptoWallets: existingCryptoWallets,
      };

      // Stop blinking and update visual node
      graphManager.stopNodeBlink(superuserId);
      try {
        graphManager.nodesDataset.update(graphManager._toVisNode(superuser));
      } catch (e) { /* ignore */ }
    });

    // Hide floating popup
    floatingAnalysisStatus.style.display = 'none';

    if (result) {
      let resultColor, resultLabel;
      if (result.identifiable) {
        resultColor = 'var(--accent-green)';
        resultLabel = 'IDENTIFIABLE';
      } else if (result.possibleIdentifiable) {
        resultColor = 'var(--accent-amber)';
        resultLabel = 'POSSIBLY IDENTIFIABLE';
      } else {
        resultColor = 'var(--text-muted)';
        resultLabel = 'NOT IDENTIFIABLE';
      }

      if (isMinimized) {
        // Show result as a toast since modal is hidden
        showToast(`Superuser #${superuserIndex}: ${resultLabel}`, result.identifiable ? 'success' : 'info');
        _resetNodeModal();
      } else {
        // Show result in modal
        nodeModalBody.innerHTML = `
          <div style="text-align:center;padding:30px 20px;">
            <div style="font-size:48px;margin-bottom:12px;">${result.identifiable ? '🟢' : result.possibleIdentifiable ? '🟠' : '⚫'}</div>
            <p style="font-size:18px;font-weight:700;color:${resultColor};margin-bottom:8px;">${resultLabel}</p>
            ${(result.reasons && result.reasons.length > 0) ? `<p style="font-size:12px;color:var(--text-secondary);max-width:400px;margin:0 auto;">${result.reasons.join(', ')}</p>` : ''}
          </div>
        `;
        setTimeout(() => {
          nodeModal.style.display = 'none';
          _resetNodeModal();
        }, 2000);
      }
    }
  } catch (e) {
    console.error('[AI] Superuser analysis failed:', e);
    graphManager.stopNodeBlink(superuserId);
    floatingAnalysisStatus.style.display = 'none';

    if (isMinimized) {
      showToast(`Superuser #${superuserIndex} analysis failed: ${e.message}`, 'error');
      _resetNodeModal();
    } else {
      nodeModalBody.innerHTML = `
        <div style="text-align:center;padding:30px 20px;">
          <div style="font-size:48px;margin-bottom:12px;">❌</div>
          <p style="font-size:16px;font-weight:700;color:var(--accent-red);margin-bottom:8px;">Analysis Failed</p>
          <p style="font-size:12px;color:var(--text-secondary);">${e.message}</p>
        </div>
      `;
      setTimeout(() => {
        nodeModal.style.display = 'none';
        _resetNodeModal();
      }, 3000);
    }
  }
}

function _resetNodeModal() {
  nodeModalActionBtn.disabled = false;
  nodeModalActionBtn.innerHTML = `
    <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
      <path d="M10 2l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="currentColor" stroke-width="1.2" fill="none" />
    </svg>
    Deep AI Analysis
  `;
  nodeModalClose.style.display = '';
  nodeModal.onclick = (e) => {
    if (e.target === nodeModal) nodeModal.style.display = 'none';
  };
}

// ===== Toggle Exploration Data =====
function handleToggleExplorationData() {
  explorationVisible = !explorationVisible;
  graphManager.toggleExplorationData(explorationVisible);

  toggleExplorationLabel.textContent = explorationVisible
    ? 'Hide Exploration Data'
    : 'Show Exploration Data';

  // Update stats
  const stats = graphManager.getStats();
  statServices.textContent = stats.services;
  statConnections.textContent = stats.connections;

  showToast(explorationVisible ? 'Exploration data shown' : 'Exploration data hidden', 'info');
}

// ===== Update AI Button State =====
function updateAIButtonState() {
  if (usersExplored) {
    btnPreidentifyUsers.disabled = false;
    btnPreidentifyUsers.classList.remove('needs-exploration');
  } else {
    btnPreidentifyUsers.disabled = true;
    btnPreidentifyUsers.classList.add('needs-exploration');
  }

  if (usersPreidentified) {
    btnAnalyzeUsers.disabled = false;
    btnAnalyzeUsers.classList.remove('needs-exploration');

    // Enable the visualizer button always once pre-identified/amplified data exists
    if (btnShowAllUsersData) {
      btnShowAllUsersData.disabled = false;
      btnShowAllUsersData.classList.remove('needs-exploration');
    }
  } else {
    btnAnalyzeUsers.disabled = true;
    btnAnalyzeUsers.classList.add('needs-exploration');

    // Keep it disabled until initial data processing is done
    if (btnShowAllUsersData) {
      btnShowAllUsersData.disabled = true;
      btnShowAllUsersData.classList.add('needs-exploration');
    }
  }
}

import { countryToFlag } from './graph.js';

// ===== Populate Country Filter =====
function populateCountryFilter(nodes) {
  const select = document.getElementById('filter-country');
  const currentVal = select.value;

  // Get unique countries from user/superuser arrays and count them
  const countryCounts = {};
  for (const node of nodes) {
    if ((node.type === 'user' || node.type === 'superuser') && node.country && node.country.trim() !== '') {

      // Ensure accurate counts avoiding invisible users natively matching Exploration hidden traits
      if (!explorationVisible && node.type === 'user' && node._superuserId) continue;

      let rawCountry = node.country.trim();
      let cleanCountry = rawCountry;

      // Extract 2-letter country code if present, ignoring IPs (e.g., 'SP - 192.168.1.1' -> 'SP')
      const twoLetterMatch = rawCountry.match(/^([A-Za-z]{2})\b/);
      if (twoLetterMatch) {
        cleanCountry = twoLetterMatch[1].toUpperCase();
      } else {
        cleanCountry = rawCountry.replace(/-\s*[\d\.:a-fA-F]+/g, '').replace(/[\d\.:a-fA-F]+/g, '').trim().toUpperCase();
      }

      if (cleanCountry) {
        countryCounts[cleanCountry] = (countryCounts[cleanCountry] || 0) + 1;
      }
    }
  }

  // Preserve the default option
  select.innerHTML = '<option value="">All Countries</option>';

  // Add sorted countries
  const sortedCountries = Object.keys(countryCounts).sort();
  for (const c of sortedCountries) {
    const opt = document.createElement('option');
    opt.value = c;
    const count = countryCounts[c];
    opt.textContent = `${c} (${count})`;
    select.appendChild(opt);
  }

  // Restore previous selection if it still exists
  if (currentVal && countryCounts[currentVal]) {
    select.value = currentVal;
  }
}

// ===== Subdomain Discovery =====
import { searchCrtsh } from './api.js';

async function handleSubdomainDiscovery() {
  if (!currentSearchTerms || currentSearchTerms.length === 0) return;

  btnSubdomains.disabled = true;
  btnSubdomains.classList.add('running');
  btnSubdomains.innerHTML = `
    <div style="width:14px;height:14px;border:2px solid;border-radius:50%;border-top-color:transparent;animation:spin 1s linear infinite;"></div>
    <span>Discovering...</span>
  `;

  try {
    let newServicesCount = 0;
    for (const domain of currentSearchTerms) {
      showToast(`Discovering subdomains for ${domain}...`, 'info');
      const subdomains = await searchCrtsh(domain);

      if (subdomains.length === 0) continue;

      // Create service nodes for ones that don't exist
      for (const sub of subdomains) {
        const svcId = `svc_${sub.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const exists = graphManager.allNodesData.find(n => n.id === svcId);

        if (!exists) {
          const serviceNode = {
            id: svcId,
            type: 'service',
            label: sub,
            hostname: sub,
            sourceType: 'breach',
            credentialsFound: 0,
            usersCount: 0,
            sources: new Set(['crt.sh']),
            isLinkedToDomain: true,
            mainDomain: domain,
            linkedDomainId: `domain_${domain.replace(/[^a-zA-Z0-9]/g, '_')}`
          };
          graphManager.addNode(serviceNode, false); // false = not an exploration
          newServicesCount++;
        }
      }
    }

    if (newServicesCount > 0) {
      showToast(`Discovered ${newServicesCount} new subdomains`, 'success');
      graphManager.applyFilters(filtersManager.getState());

      // Update stats
      const stats = graphManager.getStats();
      document.getElementById('stat-services').textContent = stats.services;
    } else {
      showToast('No new subdomains found', 'info');
    }

  } catch (e) {
    showToast(`Subdomain discovery failed: ${e.message}`, 'error');
  } finally {
    btnSubdomains.disabled = false;
    btnSubdomains.classList.remove('running');
    btnSubdomains.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none">
        <path d="M10 2v16M2 10h16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <span>Subdomains</span>
    `;
  }
}

// ===== AI Analysis =====
let aiController = null; // Controller for stopping/killing analysis

async function handleAIAnalysis() {
  if (aiRunning) return;
  aiRunning = true;
  aiController = { stopped: false, killed: false };

  btnAnalyzeUsers.disabled = true;
  aiControls.style.display = 'flex';

  const userNodes = graphManager.getUserNodes();
  if (userNodes.length === 0) {
    showToast('No users to analyze', 'warning');
    aiRunning = false;
    btnAnalyzeUsers.disabled = false;
    aiControls.style.display = 'none';
    return;
  }

  // Show progress
  aiProgressContainer.style.display = 'block';
  aiProgressBar.style.width = '0%';
  aiProgressCount.textContent = `0 / ${userNodes.length}`;
  aiProgressLabel.textContent = 'Processing users...';

  showToast(`Starting analysis of ${userNodes.length} users...`, 'info');

  const result = await analyzeUsers(
    userNodes,
    aiController,
    (processed, total, currentUserId) => {
      const pct = Math.round((processed / total) * 100);
      aiProgressBar.style.width = `${pct}%`;
      aiProgressCount.textContent = `${processed} / ${total}`;

      // Floating status for global AI analysis and node blinking
      if (currentUserId && !aiController.killed && !aiController.stopped) {

        // Disable previous blink if it existed natively
        if (aiController.activeBlinkNode) {
          graphManager.stopNodeBlink(aiController.activeBlinkNode);
        }

        aiController.activeBlinkNode = currentUserId;
        floatingAnalysisStatus.style.display = 'flex';
        floatingAnalysisText.textContent = `Analyzing user ${processed + 1}/${total} in progress`;
        graphManager.startNodeBlink(currentUserId);
      }
    },
    (userId, identifiable, reasons, evidence) => {
      // Stop the blink from the progress phase
      graphManager.stopNodeBlink(userId);
      if (aiController && aiController.activeBlinkNode === userId) {
        aiController.activeBlinkNode = null;
      }

      graphManager.setUserIdentifiable(userId, identifiable, reasons);
      // Store full AI analysis on the node for Node Actions display
      const node = graphManager.allNodesData.find(n => n.id === userId);
      if (node) node.aiAnalysis = { identifiable, reasons, evidence: evidence || [] };
    }
  );

  // Hidden at end
  floatingAnalysisStatus.style.display = 'none';

  // Done
  if (aiController.killed) {
    aiProgressLabel.textContent = 'Analysis killed';
    showToast('Analysis killed - results discarded', 'warning');
  } else if (aiController.stopped) {
    aiProgressLabel.textContent = 'Analysis stopped';
    showToast(`Analysis stopped: ${result.identifiable} of ${result.processed} analyzed`, 'info');
  } else {
    aiProgressLabel.textContent = 'Analysis complete!';
    showToast(
      `Analysis complete: ${result.identifiable} of ${result.total} users are identifiable`,
      'success'
    );
  }

  // Show identifiable filter if we have results
  if (!aiController.killed && result.identifiable > 0) {
    filtersManager.setIdentifiableVisible(true);
  }

  aiRunning = false;
  aiController = null;
  aiControls.style.display = 'none';
}

function handleStopAnalysis() {
  if (aiController) {
    aiController.stopped = true;

    // Halt any active blinking node
    if (aiController.activeBlinkNode) {
      graphManager.stopNodeBlink(aiController.activeBlinkNode);
      floatingAnalysisStatus.style.display = 'none';
    }

    showToast('Stopping analysis...', 'info');
  }
}

function handleKillAnalysis() {
  if (aiController) {
    aiController.killed = true;
    aiController.stopped = true;

    // Halt any active blinking node
    if (aiController.activeBlinkNode) {
      graphManager.stopNodeBlink(aiController.activeBlinkNode);
      floatingAnalysisStatus.style.display = 'none';
    }

    showToast('Killing analysis...', 'warning');
  }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Create a persistent toast that stays fixed in the bottom-right corner.
 * Returns the toast element so it can be updated or removed.
 */
function createPersistentToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast info';
  toast.style.cssText = 'position:relative;transition:opacity 0.3s;font-weight:500;';
  toast.textContent = message;
  container.appendChild(toast);
  return toast;
}

function updatePersistentToast(toast, message) {
  if (toast) toast.textContent = message;
}

function removePersistentToast(toast) {
  if (toast) {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }
}

// ===== Utility =====
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ===== Show User Data Visualizations =====

function handleToggleShowAllData() {
  if (showAllDataController) {
    if (showAllDataController.paused) {
      showAllDataController.paused = false;
      showToast('Resuming user data visualization...', 'info');
    } else {
      showAllDataController.paused = true;
      showToast('Pausing user data visualization...', 'warning');
    }
  }
}

async function handleShowAllUsersData() {
  if (showAllDataController) return;

  const superusers = graphManager.getSuperuserNodes();
  const allUsers = graphManager.getUserNodes();
  const standaloneUsers = allUsers.filter(u => !u._superuserId);
  const nodesToProcess = [...superusers, ...standaloneUsers];
  const suCount = superusers.length;

  if (nodesToProcess.length === 0) {
    showToast('No users or superusers to process', 'warning');
    return;
  }

  // Determine default email limit and warning based on superuser count
  let defaultLimit, warningMsg;
  if (suCount <= 10) {
    defaultLimit = 0; // 0 = all
    warningMsg = '';
  } else if (suCount <= 50) {
    defaultLimit = 3;
    warningMsg = `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,171,0,0.12);border-left:3px solid #ffab00;border-radius:4px;font-size:12px;color:#ffab00">
      <i class="fas fa-exclamation-triangle"></i> With ${suCount} superusers, high values may crash the system.<br>
      <span style="color:#e2e8f0;margin-top:4px;display:inline-block">For in-depth exploration, use <b>right-click → Show user data</b> on a specific superuser.</span>
    </div>`;
  } else if (suCount <= 100) {
    defaultLimit = 3;
    warningMsg = `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,82,82,0.12);border-left:3px solid #ff5252;border-radius:4px;font-size:12px;color:#ff5252">
      <i class="fas fa-exclamation-triangle"></i> With ${suCount} superusers, values > 3 may crash the system.<br>
      <span style="color:#e2e8f0;margin-top:4px;display:inline-block">For in-depth exploration, use <b>right-click → Show user data</b> on a specific superuser.</span>
    </div>`;
  } else {
    defaultLimit = 1;
    warningMsg = `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,82,82,0.15);border-left:3px solid #ff5252;border-radius:4px;font-size:12px;color:#ff5252">
      <i class="fas fa-exclamation-triangle"></i> With ${suCount} superusers, values > 1 will likely crash the system.<br>
      <span style="color:#e2e8f0;margin-top:4px;display:inline-block">For in-depth exploration, use <b>right-click → Show user data</b> on a specific superuser.</span>
    </div>`;
  }

  // Show popup
  const emailLimit = await showEmailLimitPopup(suCount, defaultLimit, warningMsg);
  if (emailLimit === null) return; // Cancelled

  const maxEmails = emailLimit === 0 ? Infinity : emailLimit;

  btnShowAllUsersData.disabled = true;
  btnShowAllUsersData.classList.add('running');

  showAllDataControls.style.display = 'flex';
  btnStopShowAllData.innerHTML = '<i class="fas fa-pause"></i> Pause';
  btnStopShowAllData.classList.add('danger');
  btnStopShowAllData.classList.remove('success');

  showAllDataController = { paused: false, aborted: false };

  // Forcing Tree Map
  graphManager.setMode('hierarchical');
  const treeMapBtn = document.querySelector('.mode-item[data-mode="hierarchical"]');
  const centralBtn = document.querySelector('.mode-item[data-mode="centralized"]');
  if (treeMapBtn && centralBtn) {
    treeMapBtn.classList.add('active');
    centralBtn.classList.remove('active');
  }
  showToast('Switched to Tree Map layout', 'info');

  showToast(`Generating visualizations for ${nodesToProcess.length} entities (${maxEmails === Infinity ? 'all' : maxEmails} emails each)...`, 'info');

  // Show loading overlay with progress
  loadingOverlay.style.display = 'flex';
  loadingText.textContent = `Processing 0 / ${nodesToProcess.length} superusers...`;

  // Collect all nodes/edges from all calls, render once at end
  const allNewNodes = [];
  const allNewEdges = [];

  for (let i = 0; i < nodesToProcess.length; i++) {
    const node = nodesToProcess[i];
    if (showAllDataController && showAllDataController.aborted) {
      break;
    }

    if (showAllDataController && showAllDataController.paused) {
      btnStopShowAllData.innerHTML = '<i class="fas fa-play"></i> Resume';
      btnStopShowAllData.classList.remove('danger');
      btnStopShowAllData.classList.add('success');

      await new Promise(resolve => {
        const interval = setInterval(() => {
          if (!showAllDataController.paused || showAllDataController.aborted) {
            clearInterval(interval);
            resolve();
          }
        }, 200);
      });

      if (!showAllDataController.aborted) {
        btnStopShowAllData.innerHTML = '<i class="fas fa-pause"></i> Pause';
        btnStopShowAllData.classList.add('danger');
        btnStopShowAllData.classList.remove('success');
      }
    }

    // Update loading progress
    loadingText.textContent = `Processing ${i + 1} / ${nodesToProcess.length} superusers...`;

    const result = extractAndVisualizeUserData(node, maxEmails);
    if (result && result.nodes) allNewNodes.push(...result.nodes);
    if (result && result.edges) allNewEdges.push(...result.edges);

    // Yield to keep UI responsive
    if (i % 5 === 0) await sleep(10);
  }

  // Single batch render
  if (allNewNodes.length > 0 || allNewEdges.length > 0) {
    loadingText.textContent = `Rendering ${allNewNodes.length} nodes...`;
    await sleep(50); // let the text update paint
    graphManager.batchAdd(allNewNodes, allNewEdges);
  }

  // Re-apply layout only if in hierarchical mode
  if (graphManager.layoutMode === 'hierarchical') {
    graphManager.setMode('hierarchical', true);
    setTimeout(() => {
      if (graphManager.network) graphManager.network.fit({ animation: false });
    }, 100);
  }

  loadingOverlay.style.display = 'none';
  showToast('Finished generating user data visualizations', 'success');
  btnShowAllUsersData.disabled = false;
  btnShowAllUsersData.classList.remove('running');
  showAllDataControls.style.display = 'none';
  showAllDataController = null;
}

/**
 * Show a popup recommending re-exploration after new data is appended.
 * Returns a Promise that resolves when the user chooses an option.
 */
function showReExplorePopup() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';

    overlay.innerHTML = `
      <div style="background:var(--bg-secondary, #1e293b);border:1px solid var(--border-color, #334155);border-radius:12px;padding:24px;min-width:380px;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.5);text-align:center;position:relative;">
        <button id="reExploreClose" style="position:absolute;top:10px;right:14px;background:none;border:none;color:var(--text-muted, #94a3b8);font-size:20px;cursor:pointer;line-height:1;padding:0;" title="Close">&times;</button>
        <h3 style="margin:0 0 12px;color:#e2e8f0;font-size:16px;font-family:Inter,sans-serif">
          <i class="fas fa-sync-alt" style="color:#00d4ff;margin-right:8px"></i>New Data Added
        </h3>
        <p style="margin:0 0 20px;color:#94a3b8;font-size:13px;font-family:Inter,sans-serif;line-height:1.5">
          We recommend re-exploring all users to update nodes and their connections with the newly added data.
        </p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button id="reExploreNo" style="padding:8px 20px;background:transparent;border:1px solid var(--border-color, #334155);border-radius:6px;color:#94a3b8;cursor:pointer;font-size:13px;font-family:Inter,sans-serif">No</button>
          <button id="reExploreYes" style="padding:8px 20px;background:linear-gradient(135deg,#00d4ff,#0099cc);border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Inter,sans-serif">OK (explore them)</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (shouldExplore) => {
      overlay.remove();
      if (shouldExplore) {
        handleExploreAllUsersData();
      }
      resolve();
    };

    overlay.querySelector('#reExploreYes').addEventListener('click', () => cleanup(true));
    overlay.querySelector('#reExploreNo').addEventListener('click', () => cleanup(false));
    overlay.querySelector('#reExploreClose').addEventListener('click', () => cleanup(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

function showEmailLimitPopup(suCount, defaultLimit, warningMsg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)';

    const allLabel = defaultLimit === 0 ? ' (all)' : '';
    const defaultStr = defaultLimit === 0 ? '0' : String(defaultLimit);

    overlay.innerHTML = `
      <div style="background:var(--bg-secondary, #1e293b);border:1px solid var(--border-color, #334155);border-radius:12px;padding:24px;min-width:380px;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <h3 style="margin:0 0 6px;color:#e2e8f0;font-size:16px;font-family:Inter,sans-serif">
          <i class="fas fa-users" style="color:#00d4ff;margin-right:8px"></i>Show Users Data
        </h3>
        <p style="margin:0 0 16px;color:#94a3b8;font-size:13px;font-family:Inter,sans-serif">
          ${suCount} superuser${suCount === 1 ? '' : 's'} detected
        </p>
        <label style="display:block;margin-bottom:8px;color:#e2e8f0;font-size:13px;font-family:Inter,sans-serif">
          Unique emails per superuser:
        </label>
        <div style="display:flex;align-items:center;gap:10px">
          <input id="emailLimitInput" type="number" min="0" max="50" value="${defaultStr}"
            style="flex:1;padding:8px 12px;background:var(--bg-primary, #0f172a);border:1px solid var(--border-color, #334155);border-radius:6px;color:#e2e8f0;font-size:14px;font-family:Inter,sans-serif;outline:none"
          />
          <span style="color:#64748b;font-size:12px;white-space:nowrap">0 = all${allLabel}</span>
        </div>
        ${warningMsg}
        <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
          <button id="emailLimitCancel" style="padding:8px 16px;background:transparent;border:1px solid var(--border-color, #334155);border-radius:6px;color:#94a3b8;cursor:pointer;font-size:13px;font-family:Inter,sans-serif">Cancel</button>
          <button id="emailLimitConfirm" style="padding:8px 20px;background:linear-gradient(135deg,#00d4ff,#0099cc);border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Inter,sans-serif">Explore</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#emailLimitInput');
    const cancelBtn = overlay.querySelector('#emailLimitCancel');
    const confirmBtn = overlay.querySelector('#emailLimitConfirm');

    input.focus();
    input.select();

    const cleanup = (value) => {
      overlay.remove();
      resolve(value);
    };

    cancelBtn.addEventListener('click', () => cleanup(null));
    confirmBtn.addEventListener('click', () => {
      const val = parseInt(input.value, 10);
      cleanup(isNaN(val) || val < 0 ? defaultLimit : val);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancelBtn.click();
    });
  });
}

function handleShowUserData(nodeId, nodeType) {
  let node = null;
  if (nodeType === 'superuser') {
    node = graphManager.getSuperuserNodeById(nodeId);
  } else if (nodeType === 'user') {
    node = graphManager.getUserNodeById(nodeId);
    if (node && node._superuserId) {
      node = graphManager.getSuperuserNodeById(node._superuserId);
    }
  }

  if (!node) return;
  const result = extractAndVisualizeUserData(node, Infinity); // No limit for individual exploration
  if (result && (result.nodes.length > 0 || result.edges.length > 0)) {
    graphManager.batchAdd(result.nodes, result.edges);
  }
  if (graphManager.layoutMode === 'hierarchical') {
    graphManager.setMode('hierarchical', true);
  }

  setTimeout(() => {
    if (graphManager.network) {
      const pos = graphManager.network.getPositions([node.id])[node.id];
      if (pos) {
        graphManager.network.moveTo({
          position: pos,
          scale: 1.0,
          animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
        });
      }
    }
  }, 100);
  showToast(`Visualized data for ${node.label || node.username || node.email || 'User'}`, 'success');
}

// SVG Data URIs for detail node icons
const PERSON_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="6" r="4" stroke="#e2e8f0" stroke-width="1.5"/><path d="M20 17.5C20 19.9853 20 22 12 22C4 22 4 19.9853 4 17.5C4 15.0147 7.58172 13 12 13C16.4183 13 20 15.0147 20 17.5Z" stroke="#e2e8f0" stroke-width="1.5"/></svg>')}`;

const GITHUB_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg fill="#ffffff" width="64" height="64" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16 1.375c-8.282 0-14.996 6.714-14.996 14.996 0 6.585 4.245 12.18 10.148 14.195l0.106 0.031c0.75 0.141 1.025-0.322 1.025-0.721 0-0.356-0.012-1.3-0.019-2.549-4.171 0.905-5.051-2.012-5.051-2.012-0.288-0.925-0.878-1.685-1.653-2.184l-0.016-0.009c-1.358-0.93 0.105-0.911 0.105-0.911 0.987 0.139 1.814 0.718 2.289 1.53l0.008 0.015c0.554 0.995 1.6 1.657 2.801 1.657 0.576 0 1.116-0.152 1.582-0.419l-0.016 0.008c0.072-0.791 0.421-1.489 0.949-2.005l0.001-0.001c-3.33-0.375-6.831-1.665-6.831-7.41 0-0.027-0.001-0.058-0.001-0.089 0-1.521 0.587-2.905 1.547-3.938l-0.003 0.004c-0.203-0.542-0.321-1.168-0.321-1.821 0-0.777 0.166-1.516 0.465-2.182l-0.014 0.034s1.256-0.402 4.124 1.537c1.124-0.321 2.415-0.506 3.749-0.506s2.625 0.185 3.849 0.53l-0.1-0.024c2.849-1.939 4.105-1.537 4.105-1.537 0.285 0.642 0.451 1.39 0.451 2.177 0 0.642-0.11 1.258-0.313 1.83l0.012-0.038c0.953 1.032 1.538 2.416 1.538 3.937 0 0.031 0 0.061-0.001 0.091 0 5.761-3.505 7.029-6.842 7.398 0.632 0.647 1.022 1.532 1.022 2.509 0 0.093-0.004 0.186-0.011 0.278l0.001-0.012c0 2.007-0.019 3.619-0.019 4.106 0 0.394 0.262 0.862 1.031 0.712 6.028-2.029 10.292-7.629 10.292-14.226 0-8.272-6.706-14.977-14.977-14.977z"/></svg>')}`;

const PHONE_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M8.44444 8H10C10.2444 8 10.4444 8.2 10.4444 8.44444C10.4444 9 10.5333 9.53333 10.6978 10.0311C10.7467 10.1867 10.7111 10.36 10.5867 10.4844L9.60889 11.4622C10.2489 12.72 11.28 13.7467 12.5378 14.3911L13.5156 13.4133C13.6044 13.3289 13.7156 13.2844 13.8311 13.2844C13.8756 13.2844 13.9244 13.2889 13.9689 13.3067C14.4667 13.4711 15.0044 13.56 15.5556 13.56C15.8 13.56 16 13.76 16 14.0044V15.5556C16 15.8 15.8 16 15.5556 16C11.3822 16 8 12.6178 8 8.44444C8 8.2 8.2 8 8.44444 8ZM9.57333 8.88889C9.6 9.28445 9.66667 9.67111 9.77333 10.04L9.24 10.5733C9.05778 10.04 8.94222 9.47556 8.90222 8.88889H9.57333ZM13.9556 14.2311C14.3333 14.3378 14.72 14.4044 15.1111 14.4311V15.0933C14.5244 15.0533 13.96 14.9378 13.4222 14.76L13.9556 14.2311Z" fill="#e2e8f0"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z" fill="#e2e8f0"/></svg>')}`;

const TELEGRAM_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="14" fill="url(%23tg)"/><path d="M22.9866 10.2088C23.1112 9.40332 22.3454 8.76755 21.6292 9.082L7.36482 15.3448C6.85123 15.5703 6.8888 16.3483 7.42147 16.5179L10.3631 17.4547C10.9246 17.6335 11.5325 17.541 12.0228 17.2023L18.655 12.6203C18.855 12.4821 19.073 12.7665 18.9021 12.9426L14.1281 17.8646C13.665 18.3421 13.7569 19.1512 14.314 19.5005L19.659 22.8523C20.2585 23.2282 21.0297 22.8506 21.1418 22.1261L22.9866 10.2088Z" fill="white"/><defs><linearGradient id="tg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse"><stop stop-color="%2337BBFE"/><stop offset="1" stop-color="%23007DBB"/></linearGradient></defs></svg>')}`;

const STEAM_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg fill="#e2e8f0" width="64" height="64" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M18.102 12.129c0 0 0 0 0-0.001 0-1.564 1.268-2.831 2.831-2.831s2.831 1.268 2.831 2.831c0 1.564-1.267 2.831-2.831 2.831-1.563 0-2.83-1.267-2.83-2.83zM24.691 12.135c0-2.081-1.687-3.768-3.768-3.768s-3.768 1.687-3.768 3.768c0 2.081 1.687 3.768 3.768 3.768 2.08-0.003 3.765-1.688 3.768-3.768zM10.427 23.76l-1.841-0.762c0.524 1.078 1.611 1.808 2.868 1.808 1.317 0 2.448-0.801 2.93-1.943l0.008-0.021c0.155-0.362 0.246-0.784 0.246-1.226 0-1.757-1.424-3.181-3.181-3.181-0.405 0-0.792 0.076-1.148 0.213l1.903 0.787c0.852 0.364 1.439 1.196 1.439 2.164 0 1.296-1.051 2.347-2.347 2.347-0.324 0-0.632-0.066-0.913-0.184l0.015 0.006zM15.974 1.004c-7.857 0.001-14.301 6.046-14.938 13.738l-0.004 0.054 8.038 3.322c0.668-0.462 1.495-0.737 2.387-0.737h0.002c0.079 0 0.156 0.005 0.235 0.008l3.575-5.176v-0.074c0.003-3.12 2.533-5.648 5.653-5.648 3.122 0 5.653 2.531 5.653 5.653s-2.531 5.653-5.653 5.653h-0.131l-5.094 3.638c0 0.065 0.005 0.131 0.005 0.199 0 2.342-1.899 4.241-4.241 4.241-2.047 0-3.756-1.451-4.153-3.38l-0.005-0.027-5.755-2.383c1.841 6.345 7.601 10.905 14.425 10.905 8.281 0 14.994-6.713 14.994-14.994s-6.713-14.994-14.994-14.994z"/></svg>')}`;

const WALLET_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g transform="translate(0.006,-0.003)"><circle cx="32" cy="32" r="31.5" fill="#f7931a"/><path fill="#FFF" d="m46.1,27.4c0.6-4.3-2.6-6.5-7-8.1l1.4-5.8-3.5-0.9-1.4,5.6c-0.9-0.2-1.9-0.4-2.8-0.7l1.4-5.7-3.5-0.9-1.4,5.8c-0.8-0.2-1.5-0.3-2.2-0.5l0-0-4.8-1.2-0.9,3.8s2.6,0.6,2.6,0.6c1.4,0.4,1.7,1.3,1.6,2l-1.6,6.6c0.1,0,0.2,0.1,0.4,0.1-0.1,0-0.2-0.1-0.4-0.1l-2.3,9.2c-0.2,0.4-0.6,1.1-1.6,0.8,0,0.1-2.6-0.6-2.6-0.6l-1.7,4,4.6,1.1c0.9,0.2,1.7,0.4,2.5,0.6l-1.5,5.8,3.5,0.9,1.4-5.8c1,0.3,1.9,0.5,2.8,0.7l-1.4,5.7,3.5,0.9,1.5-5.8c6,1.1,10.5,0.7,12.4-4.7,1.5-4.4-0.1-6.9-3.2-8.5,2.3-0.5,4-2,4.5-5.2zm-8,11.2c-1.1,4.4-8.4,2-10.8,1.4l1.9-7.7c2.4,0.6,10,1.8,8.9,6.3zm1.1-11.3c-1,4-7.1,2-9.1,1.5l1.7-7c2,0.5,8.4,1.4,7.3,5.6z"/></g></svg>')}`;

// Social network SVG icons for L5 child nodes
const FACEBOOK_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="#3B5998"/><path fill-rule="evenodd" clip-rule="evenodd" d="M29.315 16.9578C28.6917 16.8331 27.8498 16.74 27.3204 16.74C25.8867 16.74 25.7936 17.3633 25.7936 18.3607V20.1361H29.3774L29.065 23.8137H25.7936V35H21.3063V23.8137H19V20.1361H21.3063V17.8613C21.3063 14.7453 22.7708 13 26.4477 13C27.7252 13 28.6602 13.187 29.8753 13.4363L29.315 16.9578Z" fill="white"/></svg>')}`;
const INSTAGRAM_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="#C13584"/><path d="M24 14.162c3.204 0 3.584 0.012 4.849 0.07 1.17 0.053 1.805 0.249 2.228 0.413 0.56 0.218 0.96 0.478 1.38 0.898 0.42 0.42 0.68 0.82 0.898 1.38 0.164 0.423 0.36 1.058 0.413 2.228 0.058 1.265 0.07 1.645 0.07 4.849s-0.012 3.584-0.07 4.849c-0.053 1.17-0.249 1.805-0.413 2.228-0.218 0.56-0.478 0.96-0.898 1.38-0.42 0.42-0.82 0.68-1.38 0.898-0.423 0.164-1.058 0.36-2.228 0.413-1.265 0.058-1.645 0.07-4.849 0.07s-3.584-0.012-4.849-0.07c-1.17-0.053-1.805-0.249-2.228-0.413-0.56-0.218-0.96-0.478-1.38-0.898-0.42-0.42-0.68-0.82-0.898-1.38-0.164-0.423-0.36-1.058-0.413-2.228-0.058-1.265-0.07-1.645-0.07-4.849s0.012-3.584 0.07-4.849c0.053-1.17 0.249-1.805 0.413-2.228 0.218-0.56 0.478-0.96 0.898-1.38 0.42-0.42 0.82-0.68 1.38-0.898 0.423-0.164 1.058-0.36 2.228-0.413 1.265-0.058 1.645-0.07 4.849-0.07zM24 12c-3.259 0-3.668 0.014-4.948 0.072-1.277 0.058-2.15 0.261-2.913 0.558-0.789 0.307-1.459 0.717-2.126 1.384-0.667 0.667-1.077 1.337-1.384 2.126-0.297 0.763-0.5 1.636-0.558 2.913C12.014 20.332 12 20.741 12 24s0.014 3.668 0.072 4.948c0.058 1.277 0.261 2.15 0.558 2.913 0.307 0.789 0.717 1.459 1.384 2.126 0.667 0.667 1.337 1.077 2.126 1.384 0.763 0.297 1.636 0.5 2.913 0.558C20.332 35.986 20.741 36 24 36s3.668-0.014 4.948-0.072c1.277-0.058 2.15-0.261 2.913-0.558 0.789-0.307 1.459-0.717 2.126-1.384 0.667-0.667 1.077-1.337 1.384-2.126 0.297-0.763 0.5-1.636 0.558-2.913C35.986 27.668 36 27.259 36 24s-0.014-3.668-0.072-4.948c-0.058-1.277-0.261-2.15-0.558-2.913-0.307-0.789-0.717-1.459-1.384-2.126-0.667-0.667-1.337-1.077-2.126-1.384-0.763-0.297-1.636-0.5-2.913-0.558C27.668 12.014 27.259 12 24 12z" fill="white"/><circle cx="24" cy="24" r="5" fill="none" stroke="white" stroke-width="2"/><circle cx="30.4" cy="17.6" r="1.44" fill="white"/></svg>')}`;
const X_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="#000"/><path fill="#fff" d="M27.99 22.27L33.98 15h-1.42l-5.2 6.32L23.26 15h-4.79l6.27 9.53L18.16 33h1.42l5.49-6.66L29.54 33h4.79l-6.34-10.73zm-1.94 2.36l-.64-.95-5.06-7.55h2.18l4.09 6.1.64.95 5.31 7.93h-2.18l-4.34-6.48z"/></svg>')}`;
const LINKEDIN_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="#0077B5"/><path fill-rule="evenodd" clip-rule="evenodd" d="M18.77 14.2c0 1.53-1.26 2.2-2.62 2.2-1.25 0-2.53-0.67-2.53-2.2s1.28-2.2 2.53-2.2c1.36 0 2.62 0.67 2.62 2.2zM13.76 18.03h4.88V35h-4.88V18.03zM22.75 18.03h4.7v2.04c0.93-1.37 2.61-2.47 4.84-2.47 4.12 0 5.63 2.57 5.63 6.46V35h-4.88v-9.91c0-2.5-0.88-3.96-2.75-3.96-2.21 0-2.67 1.83-2.67 3.96V35h-4.88V18.03z" fill="white"/></svg>')}`;
const TIKTOK_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="#000"/><path fill="#2DCCD3" d="M344.5 161.3c11.6 11.9 26 19.2 40.6 22.5v-9c-13.7-1-28-5.3-40.6-13.6zm-83.7-59.2v200.6c0 26.3-18.9 43.2-41.9 43.2-7.6 0-14.9-1.8-21.1-5.1 8 10.2 20.6 16 34.4 16 23 0 41.9-16.9 41.9-43.2V113.1h36.4a100 100 0 01-2.4-11h-47.2zm-29.9 116.6v-9.9c-4.6-.8-9.2-1-13-1-51.8 0-95.2 41.6-95.2 93.2 0 33.9 16.5 62.8 41.5 79.9-17.4-17.3-28.3-41.5-28.3-69 0-51.5 43.3-93 95-93.2z"/><path fill="#F1204A" d="M313.4 299.4c0 64.1-49 98-95.2 98-20 0-38.6-6-53.9-16.5 17.3 17.1 41 27.5 67.2 27.5 46.2 0 95.2-33.9 95.2-98V206c-4.6-3.1-9-6.7-13.3-11v104.4zM197.8 340.9c-5.6-7.1-9-16.3-9-27.2 0-30.4 23.7-46.4 55.4-43.1v-50.8c-4.6-.8-9.2-1-13-1h-.2v40.9c-31.6-3.3-55.4 12.7-55.4 43.1 0 17.8 9.1 31.2 22.2 38.1zM385.1 183.9v38c-21 0-40.9-4-58.5-15.8 20.4 20.4 45.2 26.8 71.7 26.8v-47a82 82 0 01-13.3-2zm-40.6-22.5c-11.2-11.5-19.7-27.4-23.2-48.2h-10.8c6.2 22.5 18.9 38.2 34 48.2z"/><path fill="#fff" d="M218.2 397.4c46.2 0 95.2-33.9 95.2-98V195c4.2 4.2 8.7 7.9 13.3 11 17.5 11.8 37.4 15.8 58.5 15.8v-38c-14.6-3.3-29-10.6-40.6-22.5-15.1-10-27.9-25.7-34-48.2h-36.4v200.6c0 26.3-18.9 43.2-41.9 43.2-13.8 0-26.4-5.9-34.4-16-13.2-6.9-22.2-20.4-22.2-38.1 0-30.4 23.7-46.4 55.4-43.1v-40.9c-51.7.1-95 41.7-95 93.2 0 27.4 10.8 51.7 28.3 69 15.4 10.5 33.9 16.5 53.9 16.5z"/></svg>')}`;
const PINTEREST_SVG = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg width="64" height="64" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="20" fill="#BD081C"/><path fill-rule="evenodd" clip-rule="evenodd" d="M24.85 12C18.3 12 15 16.7 15 20.61c0 2.37 0.9 4.48 2.82 5.27 0.32 0.13 0.6 0 0.69-0.35 0.06-0.24 0.21-0.85 0.28-1.11 0.09-0.35 0.06-0.47-0.19-0.77-0.56-0.65-0.91-1.5-0.91-2.7 0-3.49 2.61-6.6 6.79-6.6 3.7 0 5.74 2.26 5.74 5.28 0 3.97-1.76 7.33-4.37 7.33-1.44 0-2.52-1.19-2.18-2.65 0.41-1.75 1.22-3.63 1.22-4.89 0-1.13-0.61-2.07-1.86-2.07-1.47 0-2.66 1.52-2.66 3.57 0 1.3 0.44 2.18 0.44 2.18s-1.51 6.39-1.77 7.51c-0.53 2.23-0.08 4.96-0.04 5.24 0.02 0.16 0.23 0.2 0.33 0.08 0.14-0.18 1.89-2.35 2.49-4.51 0.17-0.61 0.97-3.79 0.97-3.79 0.48 0.91 1.88 1.72 3.37 1.72 4.43 0 7.44-4.04 7.44-9.45C33.58 15.81 30.12 12 24.85 12z" fill="white"/></svg>')}`;

// Social platform detection map (URL fragment → platform info for L5 child nodes)
const SOCIAL_PLATFORM_MAP = {
  'facebook': { name: 'Facebook', svg: FACEBOOK_SVG },
  'instagram': { name: 'Instagram', svg: INSTAGRAM_SVG },
  'twitter': { name: 'X', svg: X_SVG },
  'x.com': { name: 'X', svg: X_SVG },
  'linkedin': { name: 'LinkedIn', svg: LINKEDIN_SVG },
  'tiktok': { name: 'TikTok', svg: TIKTOK_SVG },
  'pinterest': { name: 'Pinterest', svg: PINTEREST_SVG },
  'telegram': { name: 'Telegram', svg: TELEGRAM_SVG },
  'steam': { name: 'Steam', svg: STEAM_SVG },
  'discord': { name: 'Discord', code: '\uf392', face: '"Font Awesome 6 Brands"', color: '#5865F2', weight: 400 },
  'reddit': { name: 'Reddit', code: '\uf1a1', face: '"Font Awesome 6 Brands"', color: '#ff4500', weight: 400 },
  'youtube': { name: 'YouTube', code: '\uf167', face: '"Font Awesome 6 Brands"', color: '#ff0000', weight: 400 },
  'snapchat': { name: 'Snapchat', code: '\uf2ab', face: '"Font Awesome 6 Brands"', color: '#fffc00', weight: 400 },
  'twitch': { name: 'Twitch', code: '\uf1e8', face: '"Font Awesome 6 Brands"', color: '#9146ff', weight: 400 },
  'tumblr': { name: 'Tumblr', code: '\uf173', face: '"Font Awesome 6 Brands"', color: '#36465d', weight: 400 },
  'spotify': { name: 'Spotify', code: '\uf1bc', face: '"Font Awesome 6 Brands"', color: '#1db954', weight: 400 },
  'whatsapp': { name: 'WhatsApp', code: '\uf232', face: '"Font Awesome 6 Brands"', color: '#25d366', weight: 400 },
  'github': { name: 'GitHub', svg: GITHUB_SVG },
};

function detectSocialPlatform(url) {
  try {
    const host = new URL(url.startsWith('http') ? url : `http://${url}`).hostname.toLowerCase();
    for (const [fragment, info] of Object.entries(SOCIAL_PLATFORM_MAP)) {
      if (host.includes(fragment)) return info;
    }
  } catch (e) { /* skip invalid URLs */ }
  return null;
}

function extractAndVisualizeUserData(node, maxEmails = 5) {
  const data = node.explorationData || node._explorationData || {};
  let credentials = data.credentials || [];
  let amplifiedInfo = node.amplifiedInfo || {};

  // Emails already visible as user nodes connected to this superuser
  const existingEmails = new Set();
  if (node.type === 'superuser' && node.linkedUserIds) {
    node.linkedUserIds.forEach(uid => {
      const userNode = graphManager.getUserNodeById(uid);
      if (userNode && userNode.email) existingEmails.add(userNode.email.toLowerCase());
    });
  }
  // Also add linkedEmails if present
  if (node.linkedEmails && Array.isArray(node.linkedEmails)) {
    node.linkedEmails.forEach(em => existingEmails.add(em.toLowerCase()));
  }

  // ========== 1. Find emails and usernames that access social media platforms ==========
  const emailSocialCount = new Map();  // email → total social credential count
  const emailPlatforms = new Map();    // email → Map<platformName, platformInfo>

  const usernameSocialCount = new Map(); // username → total social credential count
  const usernamePlatforms = new Map();   // username → Map<platformName, platformInfo>

  // Helper to add a platform to either email or username
  const addPlatform = (identifier, isEmail, platform) => {
    if (!platform) return;
    if (isEmail) {
      emailSocialCount.set(identifier, (emailSocialCount.get(identifier) || 0) + 1);
      if (!emailPlatforms.has(identifier)) emailPlatforms.set(identifier, new Map());
      emailPlatforms.get(identifier).set(platform.name, platform);
    } else {
      usernameSocialCount.set(identifier, (usernameSocialCount.get(identifier) || 0) + 1);
      if (!usernamePlatforms.has(identifier)) usernamePlatforms.set(identifier, new Map());
      usernamePlatforms.get(identifier).set(platform.name, platform);
    }
  };

  // Build a whitelist of explicit usernames/emails from AI Analysis if available
  const aiSocialWhitelist = [];
  if (node.aiAnalysis && node.aiAnalysis.reasons) {
    for (const reason of node.aiAnalysis.reasons) {
      // Format: "Platform N PlatformName - User: username - Pass: password"
      const platMatch = reason.match(/^Platform\s+\d+\s+(\S+)\s+-\s+User:\s+(.+?)\s+-\s+Pass:/);
      if (platMatch) {
        const platName = platMatch[1].toLowerCase();
        const platUser = platMatch[2].trim().toLowerCase();
        for (const [, info] of Object.entries(SOCIAL_PLATFORM_MAP)) {
          if (info.name.toLowerCase().includes(platName) || platName.includes(info.name.toLowerCase().split('/')[0])) {
            // Avoid duplicates (e.g. 'x.com' and 'twitter' both map to 'X')
            if (!aiSocialWhitelist.find(s => s.platform === info.name && s.user === platUser)) {
              aiSocialWhitelist.push({ platform: info.name, user: platUser });
            }
            break;
          }
        }
      }
    }
  }

  // Pre-calculate which platforms have at least one non-email username
  // Only used as a fallback if AI Analysis is missing
  const platformHasUsername = new Set();
  if (aiSocialWhitelist.length === 0) {
    credentials.forEach(cred => {
      let rawUser = (cred.USER || cred.user || '').trim().toLowerCase();
      let url = cred.URL || cred.url || '';
      if (!rawUser || !url) return;
      const platform = detectSocialPlatform(url);
      if (platform && !rawUser.includes('@')) platformHasUsername.add(platform.name);
    });
  }

  credentials.forEach(cred => {
    let rawUser = (cred.USER || cred.user || '').trim().toLowerCase();
    let url = cred.URL || cred.url || '';
    if (!rawUser || !url) return;

    const platform = detectSocialPlatform(url);
    if (!platform) return;

    let isEmail = rawUser.includes('@');

    // If we have AI validation, strictly filter by it
    if (aiSocialWhitelist.length > 0) {
      const match = aiSocialWhitelist.find(s => s.platform === platform.name && s.user === rawUser);
      if (!match) return;
    } else {
      // Fallback: if no AI validation, use the basic skip logic for emails
      if (isEmail && platformHasUsername.has(platform.name)) return;
    }

    if (isEmail) {
      let dom = rawUser.split('@')[1];
      if (dom && EMAIL_DOMAIN_BLACKLIST.has(dom)) return;
      addPlatform(rawUser, true, platform);
    } else {
      addPlatform(rawUser, false, platform);
    }
  });

  // Directly inject AI whitelist entries that weren't covered by the credential loop.
  // This handles cases where the credential's URL format is non-standard (e.g. android://, 
  // or just "x" without a proper domain) and detectSocialPlatform() couldn't parse it.
  for (const entry of aiSocialWhitelist) {
    const isEmail = entry.user.includes('@');
    const alreadyAdded = isEmail 
      ? (emailPlatforms.has(entry.user) && emailPlatforms.get(entry.user).has(entry.platform))
      : (usernamePlatforms.has(entry.user) && usernamePlatforms.get(entry.user).has(entry.platform));
    
    if (!alreadyAdded) {
      // Find the platform info from SOCIAL_PLATFORM_MAP
      const platInfo = Object.values(SOCIAL_PLATFORM_MAP).find(info => info.name === entry.platform);
      if (platInfo) {
        addPlatform(entry.user, isEmail, platInfo);
      }
    }
  }

  // ========== 1b. Inject OSINT (Amplified Info) ==========
  if (amplifiedInfo.usernames) {
    for (const res of amplifiedInfo.usernames) {
      const uName = (res.username || '').trim().toLowerCase();
      if (!uName) continue;

      const isEmail = uName.includes('@');

      // Sherlock OSINT
      if (res.sherlock) {
        for (const s of res.sherlock) {
          const platform = detectSocialPlatform(s.url || s.site || '');
          if (platform) addPlatform(uName, isEmail, platform);
        }
      }
    }
  }

  if (amplifiedInfo.emails) {
    for (const res of amplifiedInfo.emails) {
      const eName = (res.email || '').trim().toLowerCase();
      if (!eName || !eName.includes('@')) continue;

      // Holehe OSINT (not directly tied to one social platform in the generic sense, but we map recognized ones)
      if (res.holehe) {
        for (const h of res.holehe) {
          const platform = detectSocialPlatform(h.domain || h.name || '');
          if (platform) addPlatform(eName, true, platform);
        }
      }
    }
  }

  // ========== 1c. Rank by frequency and apply limits ==========
  const rankedEmails = [...emailSocialCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEmails)
    .map(([email]) => email);

  const rankedUsernames = [...usernameSocialCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEmails)  // Same limit applied across the board for balance
    .map(([uname]) => uname);

  // Always include ALL GitHub-linked usernames regardless of limit
  for (const [uname, platforms] of usernamePlatforms) {
    if (!rankedUsernames.includes(uname) && platforms.has('GitHub')) {
      rankedUsernames.push(uname);
    }
  }


  // ========== 2. Build nodes ==========
  let newNodes = [];
  let newEdges = [];

  // Helper to build L4 + L5 trees
  const buildTree = (identifier, isEmail) => {
    const safeId = identifier.replace(/[^a-zA-Z0-9@.]/g, '');
    let l4NodeId = `detail_${isEmail ? 'email' : 'username'}_${node.id}_${safeId}`;
    let isRootUserNode = false;

    const lowerId = identifier.toLowerCase();
    
    // Search for an existing node in the graph that represents this identifier.
    // We search both 'user' (full 👤 nodes) and 'user_detail' (🔗 link nodes)
    // to ensure social platforms connect to whatever representation already exists.
    const existingNode = graphManager.allNodesData.find(n => {
      if (n.type !== 'user' && n.type !== 'user_detail') return false;
      
      // Exact email match
      if (n.email && n.email.toLowerCase() === lowerId) return true;
      
      // Exact username match
      if (n.username && n.username.toLowerCase() === lowerId) return true;
      
      // Exact name match
      if (n.name && n.name.toLowerCase() === lowerId) return true;
      
      // Exact label match (single line or specific line in multi-line label)
      if (n.label) {
        const lowerLabel = n.label.toLowerCase();
        if (lowerLabel === lowerId) return true;
        if (lowerLabel.split('\n').includes(lowerId)) return true;
      }
      
      return false;
    });

    if (existingNode) {
      l4NodeId = existingNode.id;
      isRootUserNode = true;
    }

    if (!isRootUserNode && !graphManager.allNodesData.find(n => n.id === l4NodeId)) {
      newNodes.push({
        id: l4NodeId,
        type: 'user_detail',
        label: identifier,
        shape: 'dot',
        size: 14,
        color: {
          background: isEmail ? 'rgba(0, 212, 255, 0.15)' : 'rgba(189, 147, 249, 0.15)',
          border: isEmail ? '#00d4ff' : '#bd93f9',
          highlight: { background: isEmail ? 'rgba(0, 212, 255, 0.25)' : 'rgba(189, 147, 249, 0.25)', border: isEmail ? '#00d4ff' : '#bd93f9' },
          hover: { background: isEmail ? 'rgba(0, 212, 255, 0.25)' : 'rgba(189, 147, 249, 0.25)', border: isEmail ? '#00d4ff' : '#bd93f9' },
        },
        font: { color: '#e2e8f0', size: 11, face: 'Inter' }
      });
      newEdges.push({ from: node.id, to: l4NodeId, type: 'detail-link' });
    }

    // Build L5 platforms
    const platformsCtx = isEmail ? emailPlatforms.get(identifier) : usernamePlatforms.get(identifier);
    if (platformsCtx) {
      for (const [platName, platInfo] of platformsCtx) {
        const platNodeId = `detail_social_${l4NodeId}_${safeId}_${platName.replace(/[^a-zA-Z0-9]/g, '')}`;

        if (!graphManager.allNodesData.find(n => n.id === platNodeId) && !newNodes.find(n => n.id === platNodeId)) {
          const nodeDef = {
            id: platNodeId,
            type: 'user_detail_service',
            label: platName,
            font: { color: '#e2e8f0', size: 10, face: 'Inter' }
          };
          if (platInfo.svg) {
            nodeDef.shape = 'image';
            nodeDef.image = platInfo.svg;
            nodeDef.size = 16;
          } else {
            nodeDef.shape = 'icon';
            nodeDef.icon = { face: platInfo.face, code: platInfo.code, color: platInfo.color, weight: platInfo.weight, size: 20 };
          }
          newNodes.push(nodeDef);
          newEdges.push({ from: l4NodeId, to: platNodeId, type: 'detail-link' });
        }
      }
    }
  };

  // Build L4+L5 pairs for ranked emails
  for (const email of rankedEmails) {
    buildTree(email, true);
  }

  // Build L4+L5 pairs for ranked usernames
  for (const uname of rankedUsernames) {
    buildTree(uname, false);
  }

  // ========== 5. Phone nodes (L4 - Remains direct connection as they are not standard usernames/emails) ==========
  let phones = new Set();
  if (node.aiAnalysis && node.aiAnalysis.reasons) {
    let phoneReason = node.aiAnalysis.reasons.find(r => r.startsWith('Has phone number: Yes'));
    if (phoneReason) {
      let parts = phoneReason.split('-');
      if (parts.length > 1) {
        let phoneNum = parts[1].trim();
        if (phoneNum) phones.add(phoneNum);
      }
    }
  }
  if (node.emailContexts) {
    for (const ctx of node.emailContexts) {
      try {
        const parsed = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
        if (parsed.phone && String(parsed.phone).trim()) phones.add(String(parsed.phone).trim());
        if (parsed.mobile && String(parsed.mobile).trim()) phones.add(String(parsed.mobile).trim());
      } catch (e) { }
    }
  }
  for (const p of phones) {
    const pNodeId = `detail_phone_${node.id}_${p.replace(/\s+/g, '')}`;
    if (!graphManager.allNodesData.find(n => n.id === pNodeId)) {
      newNodes.push({
        id: pNodeId, type: 'user_detail_phone', label: p,
        shape: 'image', image: PHONE_SVG, size: 16,
        font: { color: '#e2e8f0', size: 11, face: 'Inter' }
      });
      newEdges.push({ from: node.id, to: pNodeId, type: 'detail-link' });
    }
  }

  // ========== 7. Wallet nodes (L4) ==========
  let extractedWallets = new Map(); // lowercase_address -> { addr, prov }

  // 1. From AI analysis extraction (includes HWID, context, records)
  if (node.aiAnalysis && node.aiAnalysis._cryptoWallets) {
    for (const w of node.aiAnalysis._cryptoWallets) {
      if (w.address) extractedWallets.set(w.address.toLowerCase(), { addr: w.address, prov: w.provider || 'Crypto Wallet' });
    }
  }

  // 2. Fallback: Old credential extraction
  const WALLET_KEYWORDS = ['binance', 'coinbase', 'metamask', 'exodus', 'blockchain', 'bitcoin', 'ethereum', 'kraken', 'bybit', 'okx', 'crypto', 'wallet'];
  credentials.forEach(cred => {
    let url = (cred.URL || cred.url || '').toLowerCase();
    let user = (cred.USER || cred.user || '').trim();
    if (url && user && WALLET_KEYWORDS.some(kw => url.includes(kw))) {
      if (!extractedWallets.has(user.toLowerCase())) {
        extractedWallets.set(user.toLowerCase(), { addr: user, prov: 'Exchange' });
      }
    }
  });

  for (const [wLow, wData] of extractedWallets.entries()) {
    const wNodeId = `detail_wallet_${node.id}_${wLow.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (!graphManager.allNodesData.find(n => n.id === wNodeId)) {
      newNodes.push({
        id: wNodeId, type: 'crypto_address', label: wData.addr,
        shape: 'image', image: WALLET_SVG, size: 16,
        provider: wData.prov,
        _isDetailWallet: true,
        font: { color: '#e2e8f0', size: 11, face: 'Inter' }
      });
      newEdges.push({ from: node.id, to: wNodeId, type: 'detail-link' });
    }
  }

  // ========== Return collected nodes/edges (caller does the rendering) ==========
  return { nodes: newNodes, edges: newEdges };
}

// ===== Social Network Helpers =====

/**
 * Given a username label, extract the scraping handle.
 * If the label is an email address, return the part before @.
 * Otherwise return the label as-is.
 */
function getSocialUsername(label, platform) {
  if (!label) return null;
  const trimmed = label.trim();
  if (trimmed.includes('@')) {
    let namePart = trimmed.split('@')[0];
    if (platform === 'x' || platform === 'twitter') {
      namePart = namePart.replace(/\./g, '');
    }
    return namePart;
  }
  return trimmed;
}

/**
 * Returns true if the label looks like an email address.
 */
function isEmailLabel(label) {
  return label && label.includes('@');
}

/**
 * Returns true if the label looks like a phone number or is purely numeric.
 * These should be skipped when scraping social platforms.
 */
function isNumericOrPhoneLabel(label) {
  if (!label) return false;
  const trimmed = label.trim();
  if (trimmed.startsWith('+')) return true;
  if (/^\d+$/.test(trimmed)) return true;
  return false;
}

/**
 * For a superuser: find all username→platform pairs and scrape each supported one.
 * Skips usernames that are email addresses.
 */
async function handleShowAllSocialForSuperuser(superuserId) {
  const suNode = graphManager.getSuperuserNodeById(superuserId);
  if (!suNode) {
    showToast('Superuser not found', 'warning');
    return;
  }

  const socialTasks = [];
  const githubTasks = [];

  // Find detail-link edges FROM the superuser directly to user_detail nodes
  const detailEdges = graphManager.allEdgesData.filter(e =>
    (e.from === superuserId || e.to === superuserId)
  );

  for (const de of detailEdges) {
    const detailNodeId = de.from === superuserId ? de.to : de.from;
    const detailNode = graphManager.allNodesData.find(n => n.id === detailNodeId);
    if (!detailNode || detailNode.type !== 'user_detail') continue;

    const isEmail = isEmailLabel(detailNode.label);
    const isNumeric = isNumericOrPhoneLabel(detailNode.label);

    // Find platforms connected to this username
    const platformEdges = graphManager.allEdgesData.filter(e =>
      (e.from === detailNodeId || e.to === detailNodeId)
    );

    for (const pe of platformEdges) {
      const platNodeId = pe.from === detailNodeId ? pe.to : pe.from;
      const platNode = graphManager.allNodesData.find(n => n.id === platNodeId);
      if (!platNode || platNode.type !== 'user_detail_service') continue;

      const lbl = (platNode.label || '').toLowerCase();
      if (lbl.includes('steam')) {
        if (isEmail) continue;
        const platform = 'steam';
        const scrapeName = getSocialUsername(detailNode.label, platform);
        if (!socialTasks.find(t => t.username === scrapeName && t.platform === platform)) {
          socialTasks.push({ username: scrapeName, platform, parentNodeId: platNode.id });
        }
      } else if (lbl.includes('instagram') || lbl.includes('tiktok') || lbl.includes('pinterest') || lbl.includes('x') || lbl.includes('twitter')) {
        if (isNumeric) continue;
        const platform = lbl.includes('instagram') ? 'instagram' : (lbl.includes('tiktok') ? 'tiktok' : (lbl.includes('pinterest') ? 'pinterest' : 'x'));
        
        if (platform !== 'x' && isEmail) continue;
        
        const scrapeName = getSocialUsername(detailNode.label, platform);
        if (!socialTasks.find(t => t.username === scrapeName && t.platform === platform)) {
          socialTasks.push({ username: scrapeName, platform, parentNodeId: platNode.id });
        }
      } else if (lbl.includes('github')) {
        if (isEmail || isNumeric) continue;
        const scrapeName = getSocialUsername(detailNode.label, 'github');
        if (!githubTasks.find(t => t.username === scrapeName)) {
          githubTasks.push({ username: scrapeName, parentNodeId: platNode.id });
        }
      }
    }
  }

  const totalTasks = socialTasks.length + githubTasks.length;
  if (totalTasks === 0) {
    showToast('No supported social platforms found for this superuser.', 'warning');
    return;
  }

  // Deduce available platforms for the modal checkboxes
  const availablePlatforms = new Set();
  for (const t of socialTasks) availablePlatforms.add(t.platform);
  for (const t of githubTasks) availablePlatforms.add('github');

  // Store for execution using the same global variable as the top networks modal
  pendingTopSocialTasks = { socialTasks, githubTasks };

  // Generate modal checkboxes
  const checkboxesContainer = document.getElementById('top-social-checkboxes');
  if(checkboxesContainer) {
    checkboxesContainer.innerHTML = '';
    
    // Sort platforms alphabetically to make it nice
    const platformsArray = Array.from(availablePlatforms).sort();

    const getPlatIcon = (p) => {
        if(p==='instagram') return INSTAGRAM_SVG;
        if(p==='tiktok') return TIKTOK_SVG;
        if(p==='pinterest') return PINTEREST_SVG;
        if(p==='x' || p==='twitter') return X_SVG;
        if(p==='steam') return STEAM_SVG;
        if(p==='github') return GITHUB_SVG;
        return '';
    };

    for (const plat of platformsArray) {
      // proper capitlization
      const platName = plat === 'x' ? 'X (Twitter)' : (plat === 'github' ? 'GitHub' : plat.charAt(0).toUpperCase() + plat.slice(1));
      const iconStr = getPlatIcon(plat);
      const iconHtml = iconStr ? `<img src="${iconStr}" style="width:20px; height:20px; border-radius:4px;" />` : '';

      const div = document.createElement('div');
      div.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
          <input type="checkbox" class="top-social-platform-cb" value="${plat}" style="accent-color:var(--accent-cyan); width:16px; height:16px; flex-shrink:0;" />
          ${iconHtml}
          <span style="color:var(--text-primary); font-size:14px; font-weight: 500;">${platName}</span>
        </label>
      `;
      checkboxesContainer.appendChild(div);
    }
    
    // Reset checkall button text
    const btnSelectAll = document.getElementById('btn-top-social-select-all');
    if (btnSelectAll) btnSelectAll.textContent = "Select All";
  }

  const modal = document.getElementById('top-social-modal');
  if (modal) {
    // Reset progress UI state globally
    const barEl = document.getElementById('top-social-progress-bar');
    const countEl = document.getElementById('top-social-progress-count');
    if (barEl) barEl.style.background = 'var(--accent-cyan)';
    if (countEl) countEl.style.color = 'var(--accent-cyan)';

    modal.style.display = 'flex';
  }
}

/**
 * "Show top social networks" - iterates ALL superusers in the graph and scrapes their social platforms.
 * Fixed to search detail-link edges from the superuser ID directly (not from linkedUserIds).
 * Supports Instagram, TikTok, Pinterest (via Apify), and GitHub (via public API).
 * Skips email-based usernames for social scraping.
 */
let pendingTopSocialTasks = { socialTasks: [], githubTasks: [] };

async function handleShowTopSocialNetworks() {
  const superusers = graphManager.allNodesData.filter(n => n.type === 'superuser');
  if (superusers.length === 0) {
    showToast('No superusers found. Run "Explore all users data" first.', 'warning');
    return;
  }

  const socialTasks = [];
  const githubTasks = [];
  const availablePlatforms = new Set();

  for (const su of superusers) {
    // Find detail-link edges FROM the superuser directly to user_detail nodes
    const detailEdges = graphManager.allEdgesData.filter(e =>
      (e.from === su.id || e.to === su.id)
    );

    for (const de of detailEdges) {
      const detailNodeId = de.from === su.id ? de.to : de.from;
      const detailNode = graphManager.allNodesData.find(n => n.id === detailNodeId);
      if (!detailNode || detailNode.type !== 'user_detail') continue;
      
      const isEmail = isEmailLabel(detailNode.label);
      const isNumeric = isNumericOrPhoneLabel(detailNode.label);

      // Find platform edges from this user_detail node
      const platformEdges = graphManager.allEdgesData.filter(e =>
        (e.from === detailNodeId || e.to === detailNodeId)
      );

      for (const pe of platformEdges) {
        const platNodeId = pe.from === detailNodeId ? pe.to : pe.from;
        const platNode = graphManager.allNodesData.find(n => n.id === platNodeId);
        if (!platNode || platNode.type !== 'user_detail_service') continue;

        const lbl = (platNode.label || '').toLowerCase();
        
        if (lbl.includes('steam')) {
          if (isEmail) continue;
          availablePlatforms.add('steam');
          const scrapeName = getSocialUsername(detailNode.label, 'steam');
          if (!socialTasks.find(t => t.username === scrapeName && t.platform === 'steam')) {
            socialTasks.push({ username: scrapeName, platform: 'steam', parentNodeId: platNode.id });
          }
        } else if (lbl.includes('instagram') || lbl.includes('tiktok') || lbl.includes('pinterest') || lbl.includes('x') || lbl.includes('twitter')) {
          if (isNumeric) continue;
          const platform = lbl.includes('instagram') ? 'instagram' : (lbl.includes('tiktok') ? 'tiktok' : (lbl.includes('pinterest') ? 'pinterest' : 'x'));
          if (platform !== 'x' && isEmail) continue;

          availablePlatforms.add(platform);
          const scrapeName = getSocialUsername(detailNode.label, platform);
          if (!socialTasks.find(t => t.username === scrapeName && t.platform === platform)) {
            socialTasks.push({ username: scrapeName, platform, parentNodeId: platNode.id });
          }
        } else if (lbl.includes('github')) {
          if (isEmail || isNumeric) continue;
          availablePlatforms.add('github');
          const scrapeName = getSocialUsername(detailNode.label, 'github');
          if (!githubTasks.find(t => t.username === scrapeName)) {
            githubTasks.push({ username: scrapeName, parentNodeId: platNode.id });
          }
        }
      }
    }
  }

  if (availablePlatforms.size === 0) {
    showToast('No supported social platforms found across superusers.', 'warning');
    return;
  }

  // Store for execution
  pendingTopSocialTasks = { socialTasks, githubTasks };

  // Generate modal checkboxes
  const checkboxesContainer = document.getElementById('top-social-checkboxes');
  if(checkboxesContainer) {
    checkboxesContainer.innerHTML = '';
    
    // Sort platforms alphabetically to make it nice
    const platformsArray = Array.from(availablePlatforms).sort();

    const getPlatIcon = (p) => {
        if(p==='instagram') return INSTAGRAM_SVG;
        if(p==='tiktok') return TIKTOK_SVG;
        if(p==='pinterest') return PINTEREST_SVG;
        if(p==='x' || p==='twitter') return X_SVG;
        if(p==='steam') return STEAM_SVG;
        if(p==='github') return GITHUB_SVG;
        return '';
    };

    for (const plat of platformsArray) {
      // proper capitlization
      const platName = plat === 'x' ? 'X (Twitter)' : (plat === 'github' ? 'GitHub' : plat.charAt(0).toUpperCase() + plat.slice(1));
      const iconStr = getPlatIcon(plat);
      const iconHtml = iconStr ? `<img src="${iconStr}" style="width:20px; height:20px; border-radius:4px;" />` : '';

      const div = document.createElement('div');
      div.innerHTML = `
        <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:6px; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
          <input type="checkbox" class="top-social-platform-cb" value="${plat}" style="accent-color:var(--accent-cyan); width:16px; height:16px; flex-shrink:0;" />
          ${iconHtml}
          <span style="color:var(--text-primary); font-size:14px; font-weight: 500;">${platName}</span>
        </label>
      `;
      checkboxesContainer.appendChild(div);
    }
    
    // Reset checkall button text
    const btnSelectAll = document.getElementById('btn-top-social-select-all');
    if (btnSelectAll) btnSelectAll.textContent = "Select All";
  }

  const modal = document.getElementById('top-social-modal');
  if (modal) {
    // Reset progress UI state globally
    const barEl = document.getElementById('top-social-progress-bar');
    const countEl = document.getElementById('top-social-progress-count');
    if (barEl) barEl.style.background = 'var(--accent-cyan)';
    if (countEl) countEl.style.color = 'var(--accent-cyan)';

    modal.style.display = 'flex';
  }
}

// ===== Social Scraping Logic =====

async function fetchSocialDataForUsername(username, platform, parentNodeId, silent = false) {
  if (!silent) showToast(`Scraping ${platform} for ${username}...`, 'info');

  try {
    const response = await fetch('http://localhost:8000/api/v1/scrape/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, platform })
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.status === 'success' && data.data) {
      const socialData = data.data;
      const safeUser = username.replace(/[^a-zA-Z0-9]/g, '_');

      let newNodes = [];
      let newEdges = [];

      // Profile Node — always create/update with latest data
      const profileNodeId = `social_profile_${platform}_${parentNodeId}_${safeUser}`;

      // Debug: log what the API returned
      console.log('[Social] API response socialData:', JSON.stringify(socialData, null, 2));

      // Remove existing stale node if present so we always use fresh data
      const existingIdx = graphManager.allNodesData.findIndex(n => n.id === profileNodeId);
      if (existingIdx !== -1) {
        graphManager.allNodesData.splice(existingIdx, 1);
        try { graphManager.nodesDataset.remove(profileNodeId); } catch (e) { }
        // Also remove old edges
        const oldEdges = graphManager.allEdgesData.filter(e => e.from === profileNodeId || e.to === profileNodeId);
        for (const oe of oldEdges) {
          const oeIdx = graphManager.allEdgesData.indexOf(oe);
          if (oeIdx !== -1) graphManager.allEdgesData.splice(oeIdx, 1);
        }
        graphManager.edgesDataset.remove(oldEdges.map((_, i) => {
          const allVisEdges = graphManager.edgesDataset.get();
          return allVisEdges.find(ve => ve._data && ve._data.from === profileNodeId || ve._data && ve._data.to === profileNodeId)?.id;
        }).filter(Boolean));
      }

      const bioText = socialData.bio ? socialData.bio.replace(/"/g, '&quot;') : '';
      const titleHtml = `
        <div style="font-family:Inter;font-size:12px;max-width:250px;">
          <b>${socialData.fullName || username}</b><br>
          Followers: ${socialData.followersCount || 0} | Following: ${socialData.followsCount || 0}<br>
          Posts: ${socialData.postsCount || 0}<br>
          <div style="margin-top:4px;color:#aaa;background:#222;padding:4px;border-radius:4px;white-space:pre-wrap;">${bioText}</div>
        </div>
      `;

      let nodeDef = {
        id: profileNodeId,
        type: 'social_profile',
        label: `${socialData.fullName || username}`,
        title: titleHtml,
        size: 25,
        font: { color: '#e2e8f0', size: 12, face: 'Inter' },
        socialData: socialData
      };

      const bestPicUrl = socialData.profilePicUrlHD || socialData.profilePicUrl;
      console.log('[Social] bestPicUrl:', bestPicUrl);
      if (bestPicUrl) {
        nodeDef.shape = 'circularImage';
        nodeDef.image = `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(bestPicUrl)}`;
        nodeDef.brokenImage = platform === 'instagram' ? INSTAGRAM_SVG : (platform === 'tiktok' ? TIKTOK_SVG : (platform === 'pinterest' ? PINTEREST_SVG : (platform === 'steam' ? STEAM_SVG : X_SVG)));
        console.log('[Social] Profile image proxy URL:', nodeDef.image);
      } else {
        nodeDef.shape = 'image';
        nodeDef.image = platform === 'instagram' ? INSTAGRAM_SVG : (platform === 'tiktok' ? TIKTOK_SVG : (platform === 'pinterest' ? PINTEREST_SVG : (platform === 'steam' ? STEAM_SVG : X_SVG)));
        console.log('[Social] No profilePicUrl found, using platform SVG');
      }

      newNodes.push(nodeDef);
      newEdges.push({ from: parentNodeId, to: profileNodeId, type: 'social-link' });

      // Post Nodes
      if (socialData.latestPosts && socialData.latestPosts.length > 0) {
        socialData.latestPosts.forEach((post, idx) => {
          const postId = post.id || `post_${idx}`;
          const postNodeId = `social_post_${platform}_${profileNodeId}_${postId}`;

          if (!graphManager.allNodesData.find(n => n.id === postNodeId)) {
            const captionText = post.caption ? post.caption.replace(/"/g, '&quot;') : '';
            const titleHtml = `
              <div style="font-family:Inter;font-size:12px;max-width:250px;">
                <b>${post.type || 'Post'}</b><br>
                Likes: ${post.likesCount || 0} | Comments: ${post.commentsCount || 0} | Views: ${post.playCount || 0}<br>
                <a href="${post.url}" target="_blank" style="color:#00d4ff">View Original</a><br>
                <div style="margin-top:4px;color:#aaa;white-space:pre-wrap;">${captionText}</div>
              </div>
            `;

            let postDef = {
              id: postNodeId,
              type: 'social_post',
              label: post.type || 'Post',
              title: titleHtml,
              size: 20,
              font: { color: '#e2e8f0', size: 10, face: 'Inter' }
            };

            if (post.displayUrl) {
              postDef.shape = 'image';
              postDef.image = `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(post.displayUrl)}`;
              postDef.brokenImage = platform === 'instagram' ? INSTAGRAM_SVG : (platform === 'tiktok' ? TIKTOK_SVG : (platform === 'x' ? X_SVG : PINTEREST_SVG));
            } else {
              postDef.shape = 'image';
              postDef.image = platform === 'instagram' ? INSTAGRAM_SVG : (platform === 'tiktok' ? TIKTOK_SVG : (platform === 'x' ? X_SVG : PINTEREST_SVG));
            }

            newNodes.push(postDef);
            newEdges.push({ from: profileNodeId, to: postNodeId, type: 'social-post-link' });
          }
        });
      }

      if (newNodes.length > 0) {
        graphManager.batchAdd(newNodes, newEdges);
        showToast(`Added ${newNodes.length} nodes for ${username}`, 'success');

        if (graphManager.layoutMode === 'hierarchical') {
          graphManager.setMode('hierarchical', true);
        }
      } else {
        showToast(`No new data found for ${username}`, 'info');
      }

    } else {
      if (platform === 'x' || platform === 'twitter' || platform === 'instagram' || platform === 'steam') {
        createEmptySocialNode(username, platform, parentNodeId);
      } else {
        showToast(`No social data found for ${username} on ${platform}`, 'warning');
      }
    }
  } catch (error) {
    console.error('Scraping error:', error);
    if (platform === 'x' || platform === 'twitter' || platform === 'instagram' || platform === 'steam') {
      createEmptySocialNode(username, platform, parentNodeId);
    } else {
      showToast(`Failed to scrape ${platform} for ${username}: ${error.message}`, 'error');
    }
  }
}

function createEmptySocialNode(username, platform, parentNodeId) {
  const safeUser = username.replace(/[^a-zA-Z0-9]/g, '_');
  const profileNodeId = `social_profile_${platform}_${parentNodeId}_${safeUser}_empty`;
  
  if (!graphManager.allNodesData.find(n => n.id === profileNodeId)) {
    const titleHtml = `
      <div style="font-family:Inter;font-size:12px;max-width:250px;">
        <b>${username}</b><br>
        <span style="color:#ff4444">No active account found.</span>
      </div>
    `;

    let platformSVG = X_SVG;
    if (platform === 'instagram') platformSVG = INSTAGRAM_SVG;
    else if (platform === 'tiktok') platformSVG = TIKTOK_SVG;
    else if (platform === 'pinterest') platformSVG = PINTEREST_SVG;
    else if (platform === 'steam') platformSVG = STEAM_SVG;
    else if (platform === 'github') platformSVG = GITHUB_SVG;

    let nodeDef = {
      id: profileNodeId,
      type: 'social_profile',
      label: `${username} (Not Found)`,
      title: titleHtml,
      size: 25,
      shape: 'image',
      image: platformSVG,
      font: { color: '#888888', size: 12, face: 'Inter' },
    };

    graphManager.batchAdd([nodeDef], [{ from: parentNodeId, to: profileNodeId, type: 'social-link' }]);
    showToast(`No active account found for ${username} on ${platform}. Added empty node.`, 'info');
    
    // Refresh the graph layout so the node appears to the right in tree view
    if (graphManager.layoutMode === 'hierarchical') {
      graphManager.setMode('hierarchical', true);
    }
  } else {
    showToast(`No active account found for ${username} on ${platform}.`, 'info');
  }
}


// ===== GitHub Profile Fetching =====

async function fetchGitHubProfile(username, parentNodeId) {
  showToast(`Fetching GitHub profile for ${username}...`, 'info');

  try {
    const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`);
    if (!response.ok) {
      if (response.status === 404) {
        showToast(`GitHub user "${username}" not found.`, 'warning');
        return;
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const ghData = await response.json();
    const safeUser = username.replace(/[^a-zA-Z0-9]/g, '_');

    let newNodes = [];
    let newEdges = [];

    // Profile Node with avatar
    const profileNodeId = `social_profile_github_${parentNodeId}_${safeUser}`;

    // Remove existing stale node if present
    const existingIdx = graphManager.allNodesData.findIndex(n => n.id === profileNodeId);
    if (existingIdx !== -1) {
      graphManager.allNodesData.splice(existingIdx, 1);
      try { graphManager.nodesDataset.remove(profileNodeId); } catch (e) { }
    }

    const avatarUrl = ghData.avatar_url || '';
    const proxyAvatar = avatarUrl ? `http://localhost:8000/api/v1/proxy-image?url=${encodeURIComponent(avatarUrl)}` : '';

    const profileNode = {
      id: profileNodeId,
      type: 'social_profile',
      label: ghData.name || ghData.login || username,
      shape: proxyAvatar ? 'circularImage' : 'dot',
      image: proxyAvatar || undefined,
      size: 25,
      color: proxyAvatar ? undefined : {
        background: 'rgba(255, 255, 255, 0.15)',
        border: '#ffffff',
      },
      font: { color: '#e2e8f0', size: 11, face: 'Inter' },
      socialData: {
        platform: 'github',
        username: ghData.login || username,
        fullName: ghData.name || '',
        bio: ghData.bio || '',
        followersCount: ghData.followers || 0,
        followsCount: ghData.following || 0,
        postsCount: ghData.public_repos || 0,
        profilePicUrl: avatarUrl,
        profilePicUrlHD: avatarUrl,
        url: ghData.html_url || `https://github.com/${username}`,
        private: false,
        verified: false,
        location: ghData.location || '',
        company: ghData.company || '',
        blog: ghData.blog || '',
        email: ghData.email || '',
        twitterUsername: ghData.twitter_username || '',
        createdAt: ghData.created_at || '',
        updatedAt: ghData.updated_at || '',
      }
    };

    newNodes.push(profileNode);
    newEdges.push({ from: parentNodeId, to: profileNodeId, type: 'social-link' });

    // ===== Twitter/X username discovery =====
    const twitterUser = (ghData.twitter_username || '').trim();
    if (twitterUser && twitterUser.toLowerCase() !== username.toLowerCase()) {
      // Walk up from parentNodeId (user_detail_service → user_detail → superuser)
      // parentNodeId is the GitHub platform node (user_detail_service)
      // Find the user_detail node connected to parentNodeId
      let superuserId = null;
      const parentEdges = graphManager.allEdgesData.filter(e =>
        e.from === parentNodeId || e.to === parentNodeId
      );
      for (const pe of parentEdges) {
        const otherId = pe.from === parentNodeId ? pe.to : pe.from;
        const otherNode = graphManager.allNodesData.find(n => n.id === otherId);
        if (otherNode && otherNode.type === 'user_detail') {
          // Found user_detail node, now find the superuser connected to it
          const detailEdges = graphManager.allEdgesData.filter(e =>
            e.from === otherId || e.to === otherId
          );
          for (const de of detailEdges) {
            const supId = de.from === otherId ? de.to : de.from;
            const supNode = graphManager.allNodesData.find(n => n.id === supId);
            if (supNode && supNode.type === 'superuser') {
              superuserId = supId;
              break;
            }
          }
          if (superuserId) break;
        }
      }

      if (superuserId) {
        console.log(`[GitHub] Twitter username "${twitterUser}" discovered from GitHub profile of "${username}". Superuser: ${superuserId}`);

        // Check if a user_detail node with that twitter username already exists under this superuser
        const suEdges = graphManager.allEdgesData.filter(e =>
          e.from === superuserId || e.to === superuserId
        );
        let existingDetailNode = null;
        for (const se of suEdges) {
          const detId = se.from === superuserId ? se.to : se.from;
          const detNode = graphManager.allNodesData.find(n => n.id === detId);
          if (detNode && detNode.type === 'user_detail' && detNode.label && detNode.label.toLowerCase() === twitterUser.toLowerCase()) {
            existingDetailNode = detNode;
            break;
          }
        }

        const xPlatInfo = SOCIAL_PLATFORM_MAP['x.com'] || SOCIAL_PLATFORM_MAP['twitter'] || { name: 'X', svg: X_SVG };

        if (existingDetailNode) {
          // Username node exists — check if X platform node is already attached
          const detEdges = graphManager.allEdgesData.filter(e =>
            e.from === existingDetailNode.id || e.to === existingDetailNode.id
          );
          let hasX = false;
          for (const de of detEdges) {
            const sId = de.from === existingDetailNode.id ? de.to : de.from;
            const sNode = graphManager.allNodesData.find(n => n.id === sId);
            if (sNode && sNode.type === 'user_detail_service' && (sNode.label || '').toLowerCase().includes('x')) {
              hasX = true;
              break;
            }
          }
          if (!hasX) {
            // Create X platform node connected to existing username
            const xNodeId = `detail_social_${superuserId}_${twitterUser.replace(/[^a-zA-Z0-9]/g, '')}_X`;
            const xNode = {
              id: xNodeId,
              type: 'user_detail_service',
              label: xPlatInfo.name,
              shape: xPlatInfo.svg ? 'image' : 'icon',
              font: { color: '#e2e8f0', size: 10, face: 'Inter' },
            };
            if (xPlatInfo.svg) {
              xNode.image = xPlatInfo.svg;
              xNode.size = 16;
            } else {
              xNode.icon = { face: xPlatInfo.face, code: xPlatInfo.code, color: xPlatInfo.color, weight: xPlatInfo.weight, size: 20 };
            }
            newNodes.push(xNode);
            newEdges.push({ from: existingDetailNode.id, to: xNodeId, type: 'detail-link' });
            console.log(`[GitHub] Created X platform node for existing username "${twitterUser}"`);
          }
        } else {
          // Create new username node + X platform node
          const safeTwUser = twitterUser.replace(/[^a-zA-Z0-9@.]/g, '');
          const twDetailId = `detail_username_${superuserId}_${safeTwUser}`;
          const twDetailNode = {
            id: twDetailId,
            type: 'user_detail',
            label: twitterUser,
            shape: 'dot',
            size: 14,
            color: {
              background: 'rgba(189, 147, 249, 0.15)',
              border: '#bd93f9',
              highlight: { background: 'rgba(189, 147, 249, 0.25)', border: '#bd93f9' },
              hover: { background: 'rgba(189, 147, 249, 0.25)', border: '#bd93f9' },
            },
            font: { color: '#e2e8f0', size: 11, face: 'Inter' }
          };
          newNodes.push(twDetailNode);
          newEdges.push({ from: superuserId, to: twDetailId, type: 'detail-link' });

          const xNodeId = `detail_social_${superuserId}_${safeTwUser}_X`;
          const xNode = {
            id: xNodeId,
            type: 'user_detail_service',
            label: xPlatInfo.name,
            shape: xPlatInfo.svg ? 'image' : 'icon',
            font: { color: '#e2e8f0', size: 10, face: 'Inter' },
          };
          if (xPlatInfo.svg) {
            xNode.image = xPlatInfo.svg;
            xNode.size = 16;
          } else {
            xNode.icon = { face: xPlatInfo.face, code: xPlatInfo.code, color: xPlatInfo.color, weight: xPlatInfo.weight, size: 20 };
          }
          newNodes.push(xNode);
          newEdges.push({ from: twDetailId, to: xNodeId, type: 'detail-link' });
          console.log(`[GitHub] Created new username "${twitterUser}" + X platform node under superuser ${superuserId}`);
        }

        // Update superuser credential/social data
        const suNode = graphManager.allNodesData.find(n => n.id === superuserId);
        if (suNode) {
          if (!suNode.explorationData) suNode.explorationData = {};
          if (!suNode.explorationData.credentials) suNode.explorationData.credentials = [];
          // Add Twitter credential if not already present
          const alreadyHas = suNode.explorationData.credentials.some(c =>
            c.url && c.url.includes('x.com') && c.user && c.user.toLowerCase() === twitterUser.toLowerCase()
          );
          if (!alreadyHas) {
            suNode.explorationData.credentials.push({
              url: `https://x.com/${twitterUser}`,
              user: twitterUser,
              pass: '',
              source: 'github-discovery'
            });
          }
        }
      }
    }

    if (newNodes.length > 0) {
      graphManager.appendData({ nodes: newNodes, edges: newEdges });
      if (graphManager && graphManager.layoutMode) {
        graphManager.setMode(graphManager.layoutMode);
      }
      showToast(`GitHub profile loaded for ${username}`, 'success');
    }
  } catch (error) {
    console.error('[GitHub] Fetch error:', error);
    showToast(`Failed to fetch GitHub profile for ${username}: ${error.message}`, 'error');
  }
}

// ===== Explore Transactions (Crypto Wallet Analysis) =====
async function handleExploreTransactions(nodeId) {
  // Get node data
  const nodeData = graphManager.allNodesData.find(n => n.id === nodeId);
  if (!nodeData) {
    showToast('Node not found', 'error');
    return;
  }

  // Prevent double-exploration
  if (nodeData._cryptoExplored) {
    showToast('Transactions already explored for this address', 'info');
    return;
  }

  const walletAddress = (nodeData.label || '').trim();
  if (!walletAddress) {
    showToast('No wallet address found on this node', 'error');
    return;
  }

  const network = detectCryptoNetwork(walletAddress);
  if (network === 'UNKNOWN') {
    showToast(`Unrecognized crypto address format: ${walletAddress}`, 'warning');
    return;
  }

  showToast(`Exploring transactions for ${walletAddress.slice(0, 10)}... (${network})`, 'info');

  let balance = 0;
  let transactions = [];
  const currencyLabel = network === 'EVM' ? 'ETH' : 'BTC';

  try {
    // ===== 1. Fetch balance =====
    if (network === 'EVM') {
      const balData = await fetchEVMBalance(walletAddress);
      balance = balData.nativeBalance;
      const tokenSummary = balData.tokens.filter(t => t.balance > 0).map(t => `${t.balance.toFixed(2)} ${t.symbol}`).join(', ');
      console.log(`[Crypto] EVM Balance: ${balance.toFixed(4)} ETH | Tokens: ${tokenSummary || 'none'}`);
    } else if (network === 'BTC_INDIVIDUAL') {
      const balData = await fetchBTCBalance(walletAddress);
      balance = balData.balance;
      console.log(`[Crypto] BTC Balance: ${balance.toFixed(6)} BTC`);
    } else if (network === 'BTC_XPUB') {
      const balData = await fetchXPUBBalance(walletAddress);
      balance = balData.balance;
      console.log(`[Crypto] XPUB Balance: ${balance.toFixed(6)} BTC`);
    }

    // ===== 2. Fetch transactions =====
    if (network === 'EVM') {
      transactions = await fetchEVMTransactions(walletAddress, 25);
    } else if (network === 'BTC_INDIVIDUAL') {
      transactions = await fetchBTCTransactions(walletAddress, 25);
    } else if (network === 'BTC_XPUB') {
      transactions = await fetchXPUBTransactions(walletAddress, 25);
    }

    console.log(`[Crypto] Found ${transactions.length} transactions for ${walletAddress.slice(0, 10)}...`);

    // ===== 3. Store balance on the underlying node data and update visual =====
    nodeData.cryptoBalance = balance;
    nodeData.cryptoNetwork = network;
    try {
      graphManager.nodesDataset.update(graphManager._toVisNode(nodeData));
    } catch (e) { /* node may not be in visible dataset */ }

    // ===== 4. Collect unique destination addresses =====
    const destinationAddresses = new Map(); // address -> { totalValue, txCount }

    for (const tx of transactions) {
      if (network === 'EVM') {
        // EVM: single to address per transaction
        const dest = tx.to;
        if (dest && dest.toLowerCase() !== walletAddress.toLowerCase()) {
          if (!destinationAddresses.has(dest)) {
            destinationAddresses.set(dest, { totalValue: 0, txCount: 0 });
          }
          const entry = destinationAddresses.get(dest);
          entry.totalValue += tx.value;
          entry.txCount++;
        }
      } else {
        // BTC/XPUB: multiple destinations per transaction
        for (const out of (tx.destinations || [])) {
          const dest = out.address;
          if (dest && dest !== walletAddress) {
            if (!destinationAddresses.has(dest)) {
              destinationAddresses.set(dest, { totalValue: 0, txCount: 0 });
            }
            const entry = destinationAddresses.get(dest);
            entry.totalValue += out.value;
            entry.txCount++;
          }
        }
      }
    }

    console.log(`[Crypto] Found ${destinationAddresses.size} unique destination addresses`);

    // ===== 5. Create destination address nodes =====
    const newNodes = [];
    const newEdges = [];
    const discoveredUsers = []; // {email, username, address} from wallet API

    for (const [destAddr, info] of destinationAddresses) {
      const destNodeId = `crypto_addr_${destAddr.replace(/[^a-zA-Z0-9]/g, '')}`;

      // Skip if node already exists
      if (graphManager.allNodesData.find(n => n.id === destNodeId)) continue;

      // Detect network for the destination address
      const destNetwork = detectCryptoNetwork(destAddr);

      newNodes.push({
        id: destNodeId,
        type: 'crypto_address',
        label: destAddr,
        cryptoNetwork: destNetwork !== 'UNKNOWN' ? destNetwork : network,
        cryptoBalance: 0, // Will be updated lazily or on next explore
        txCount: info.txCount,
        totalReceived: info.totalValue,
        _cryptoExplored: false
      });

      newEdges.push({
        from: nodeId,
        to: destNodeId,
        type: 'crypto-link'
      });

      // ===== 6. Cross-reference with HaveIBeenRansom wallets API =====
      try {
        const walletUsers = await searchWalletUsers(destAddr);
        if (walletUsers.length > 0) {
          console.log(`[Crypto] Found ${walletUsers.length} user records for destination ${destAddr.slice(0, 10)}...`);
          for (const record of walletUsers) {
            const email = (record.email || record.Email || '').trim().toLowerCase();
            const username = (record.username || record.Username || '').trim();
            if (email || username) {
              discoveredUsers.push({ email, username, address: destAddr, record });
            }
          }
        }
      } catch (e) {
        console.warn(`[Crypto] Wallet user lookup failed for ${destAddr}:`, e.message);
      }

      // Throttle API calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // ===== 7. Add destination nodes to graph =====
    if (newNodes.length > 0 || newEdges.length > 0) {
      graphManager.batchAdd(newNodes, newEdges);
    }

    // ===== 8. Process discovered users =====
    const processedEmails = new Set();
    for (const discovery of discoveredUsers) {
      const identifier = discovery.email || discovery.username;
      if (!identifier || processedEmails.has(identifier)) continue;
      processedEmails.add(identifier);

      // Check if user already exists in the graph
      const existingUser = graphManager.allNodesData.find(n => {
        if (n.type !== 'user') return false;
        if (n.email && n.email.toLowerCase() === identifier.toLowerCase()) return true;
        if (n.username && n.username.toLowerCase() === identifier.toLowerCase()) return true;
        return false;
      });

      if (existingUser) {
        // Connect the destination address node to the existing user
        const destNodeId = `crypto_addr_${discovery.address.replace(/[^a-zA-Z0-9]/g, '')}`;
        const edgeExists = graphManager.allEdgesData.find(e =>
          (e.from === destNodeId && e.to === existingUser.id) ||
          (e.from === existingUser.id && e.to === destNodeId)
        );
        if (!edgeExists) {
          graphManager.addEdge({ from: destNodeId, to: existingUser.id, type: 'crypto-link' }, true);
        }
        console.log(`[Crypto] Linked existing user ${identifier} to destination address`);
      } else {
        // Create a new user node
        const newUserId = `user_crypto_${Date.now()}_${identifier.replace(/[^a-zA-Z0-9]/g, '')}`;
        const isEmail = identifier.includes('@');
        const newUserNode = {
          id: newUserId,
          type: 'user',
          label: identifier,
          email: isEmail ? identifier : null,
          username: !isEmail ? identifier : null,
          isOrgEmail: false,
          serviceIds: [],
          hwids: [],
          rawData: [],
          _cryptoDiscovered: true
        };

        graphManager.addNode(newUserNode, true);

        // Link to the destination address node
        const destNodeId = `crypto_addr_${discovery.address.replace(/[^a-zA-Z0-9]/g, '')}`;
        graphManager.addEdge({ from: destNodeId, to: newUserId, type: 'crypto-link' }, true);

        console.log(`[Crypto] Created new user node for ${identifier} from wallet API`);

        // Run explore user data to build superuser chain
        try {
          await handleExploreUserData(newUserId);
        } catch (e) {
          console.warn(`[Crypto] Could not explore user data for ${identifier}:`, e.message);
        }
      }
    }

    // ===== 9. Mark source node as explored and store transaction data =====
    nodeData._cryptoExplored = true;
    nodeData._cryptoTransactions = transactions;
    nodeData._cryptoCurrency = currencyLabel;

    // ===== 10. Refresh layout =====
    // Apply filters first (rebuilds vis dataset), then re-apply treemap layout
    graphManager.applyFilters(filtersManager.getState());
    graphManager.setMode(graphManager.layoutMode || 'hierarchical', true);

    // Focus on the source node
    setTimeout(() => {
      if (graphManager.network) {
        const pos = graphManager.network.getPositions([nodeId])[nodeId];
        if (pos) {
          graphManager.network.moveTo({
            position: pos,
            scale: 0.8,
            animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
          });
        }
      }
    }, 300);

    const balanceText = `${balance.toFixed(balance < 0.001 ? 8 : 4)} ${currencyLabel}`;
    const destText = destinationAddresses.size > 0 ? `${destinationAddresses.size} destination addresses` : 'no destinations';
    const userText = discoveredUsers.length > 0 ? `, ${processedEmails.size} users discovered` : '';
    showToast(`Balance: ${balanceText} | ${transactions.length} txs → ${destText}${userText}`, 'success');

  } catch (error) {
    console.error('[Crypto] Explore transactions error:', error);
    showToast(`Error exploring transactions: ${error.message}`, 'error');
  }
}

// Top Social Modal Events
if (document.getElementById('btn-top-social-close')) {
  document.getElementById('btn-top-social-close').addEventListener('click', () => {
    document.getElementById('top-social-modal').style.display = 'none';
  });
}
if (document.getElementById('btn-top-social-cancel')) {
  document.getElementById('btn-top-social-cancel').addEventListener('click', () => {
    document.getElementById('top-social-modal').style.display = 'none';
  });
}
if (document.getElementById('btn-top-social-select-all')) {
  document.getElementById('btn-top-social-select-all').addEventListener('click', (e) => {
    const checkboxes = document.querySelectorAll('.top-social-platform-cb');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    e.target.textContent = allChecked ? "Select All" : "Deselect All";
  });
}
if (document.getElementById('btn-top-social-confirm')) {
  document.getElementById('btn-top-social-confirm').addEventListener('click', async () => {
    const selectedPlatforms = Array.from(document.querySelectorAll('.top-social-platform-cb'))
                                 .filter(cb => cb.checked)
                                 .map(cb => cb.value);

    if (selectedPlatforms.length === 0) {
      showToast('No platforms selected.', 'warning');
      return;
    }

    if (btnShowTopSocial) {
      btnShowTopSocial.disabled = true;
      btnShowTopSocial.classList.add('running');
    }

    const { socialTasks, githubTasks } = pendingTopSocialTasks;
    const filteredSocialTasks = socialTasks.filter(t => selectedPlatforms.includes(t.platform));
    const filteredGithubTasks = selectedPlatforms.includes('github') ? githubTasks : [];

    const totalTasks = filteredSocialTasks.length + filteredGithubTasks.length;
    if (totalTasks === 0) {
      showToast('No tasks found for selected platforms.', 'warning');
      document.getElementById('top-social-modal').style.display = 'none';
      if (btnShowTopSocial) {
        btnShowTopSocial.disabled = false;
        btnShowTopSocial.classList.remove('running');
      }
      return;
    }

    // Close Modal and Show Floating Progress
    document.getElementById('top-social-modal').style.display = 'none';
    const progressView = document.getElementById('floating-social-progress');
    if (progressView) progressView.style.display = 'block';
    
    const countEl = document.getElementById('top-social-progress-count');
    const barEl = document.getElementById('top-social-progress-bar');
    const txtEl = document.getElementById('top-social-current-task');

    let processed = 0;
    const updateUIProgress = (username, platform) => {
        if(countEl) countEl.textContent = `${processed} / ${totalTasks}`;
        if(barEl) barEl.style.width = `${(processed / totalTasks) * 100}%`;
        if(txtEl) txtEl.textContent = `Scraping: ${platform} — ${username}`;
    };
    
    updateUIProgress('Initializing...', '');

    for (const task of filteredGithubTasks) {
      updateUIProgress(task.username, 'GitHub');
      try {
        await fetchGitHubProfile(task.username, task.parentNodeId);
      } catch (e) {
        console.warn(`[Social] Error fetching GitHub for ${task.username}:`, e);
      }
      processed++;
    }

    for (const task of filteredSocialTasks) {
      updateUIProgress(task.username, task.platform);
      try {
        await fetchSocialDataForUsername(task.username, task.platform, task.parentNodeId, true);
      } catch (e) {
        console.warn(`[Social] Error scraping ${task.platform} for ${task.username}:`, e);
      }
      processed++;
    }

    // Final update
    if(countEl) {
      countEl.textContent = `${processed} / ${totalTasks}`;
      countEl.style.color = 'var(--text-success)';
    }
    if(barEl) {
      barEl.style.width = `100%`;
      barEl.style.background = 'var(--status-success)';
    }
    if(txtEl) txtEl.textContent = `Finished exploring ${totalTasks} social networks.`;

    showToast(`Finished scraping ${totalTasks} social profile(s).`, 'success');

    if (btnShowTopSocial) {
      btnShowTopSocial.disabled = false;
      btnShowTopSocial.classList.remove('running');
    }

    // Hide after 3 seconds
    setTimeout(() => {
      if(progressView) progressView.style.display = 'none';
    }, 3000);
  });
}

// ===== Start =====
init();

