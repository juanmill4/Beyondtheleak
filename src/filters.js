/**
 * DarkEye Filters Manager
 * Manages sidebar filter state and binding
 */

export class FiltersManager {
    constructor() {
        // Filter elements
        this.els = {
            showUsers: document.getElementById('filter-show-users'),
            nameFilter: document.getElementById('filter-name'),
            orgEmail: document.getElementById('filter-org-email'),
            nonOrgEmail: document.getElementById('filter-non-org-email'),
            multiService: document.getElementById('filter-multi-service'),
            showDeleted: document.getElementById('filter-deleted'),
            identifiable: document.getElementById('filter-identifiable'),
            linkedServices: document.getElementById('filter-linked-services'),
            hideExternal: document.getElementById('filter-hide-external'),
            stealerOnly: document.getElementById('filter-stealer-only'),
            countryFilter: document.getElementById('filter-country'),
            showFlags: document.getElementById('filter-show-flags'),
        };

        this.onChange = null;  // callback
        this._bindEvents();
    }

    _bindEvents() {
        // Checkboxes
        const checkboxes = [
            'showUsers', 'orgEmail', 'nonOrgEmail',
            'multiService', 'showDeleted', 'identifiable', 'linkedServices', 'hideExternal', 'stealerOnly', 'showFlags'
        ];

        for (const key of checkboxes) {
            this.els[key]?.addEventListener('change', () => {
                this._handleExclusivity(key);
                this._emitChange();
            });
        }

        // Name filter with debounce
        let debounceTimer;
        this.els.nameFilter?.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this._emitChange(), 250);
        });

        // Country filter dropdown
        this.els.countryFilter?.addEventListener('change', () => {
            this._emitChange();
        });
    }

    /**
     * Handle exclusivity rules:
     * - orgEmail and nonOrgEmail are mutually exclusive
     */
    _handleExclusivity(changedKey) {
        if (changedKey === 'orgEmail' && this.els.orgEmail.checked) {
            this.els.nonOrgEmail.checked = false;
        }
        if (changedKey === 'nonOrgEmail' && this.els.nonOrgEmail.checked) {
            this.els.orgEmail.checked = false;
        }
    }

    _emitChange() {
        if (this.onChange) {
            this.onChange(this.getState());
        }
    }

    getState() {
        return {
            showUsers: this.els.showUsers?.checked ?? true,
            nameFilter: this.els.nameFilter?.value || '',
            orgEmail: this.els.orgEmail?.checked || false,
            nonOrgEmail: this.els.nonOrgEmail?.checked || false,
            multiService: this.els.multiService?.checked || false,
            showDeleted: this.els.showDeleted?.checked || false,
            identifiableOnly: this.els.identifiable?.checked || false,
            linkedServicesOnly: this.els.linkedServices?.checked || false,
            hideExternal: this.els.hideExternal?.checked ?? true,
            stealerOnly: this.els.stealerOnly?.checked || false,
            countryFilter: this.els.countryFilter?.value || '',
            showFlags: this.els.showFlags?.checked ?? true,
        };
    }

    reset() {
        this.els.showUsers.checked = true;
        this.els.nameFilter.value = '';
        this.els.orgEmail.checked = false;
        this.els.nonOrgEmail.checked = false;
        this.els.multiService.checked = false;
        this.els.showDeleted.checked = false;
        this.els.identifiable.checked = false;
        this.els.linkedServices.checked = false;
        if (this.els.hideExternal) this.els.hideExternal.checked = true;
        if (this.els.stealerOnly) this.els.stealerOnly.checked = false;
    }

    setIdentifiableVisible(visible) {
        const group = document.getElementById('filter-identifiable-group');
        if (group) {
            group.style.display = visible ? 'block' : 'none';
        }
    }
}
