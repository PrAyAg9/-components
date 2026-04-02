import LightningModal from 'lightning/modal';
import { api } from 'lwc';
import searchProducts from '@salesforce/apex/QuoteActionService.searchProducts';
import addProductsToQuote from '@salesforce/apex/QuoteActionService.addProductsToQuote';
import getProductFamilies from '@salesforce/apex/QuoteActionService.getProductFamilies';

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/80/f1f5f9/94a3b8?text=Product';
const SEARCH_DEBOUNCE_MS = 350;

export default class ProductSearchModal extends LightningModal {
    @api quoteId;

    searchTerm = '';
    selectedFamily = '';
    searchResults = [];
    selectedIds = new Set();
    isSearching = false;
    hasSearched = false;
    families = [];
    _debounceTimer;

    connectedCallback() {
        this._loadFamilies();
    }

    // ─── FAMILY FILTER ────────────────────────────────────────────
    async _loadFamilies() {
        try {
            const result = await getProductFamilies();
            this.families = result || [];
        } catch (error) {
            console.error('Error loading families:', error);
        }
    }

    get familyOptions() {
        const options = [{ label: 'All Families', value: '' }];
        this.families.forEach(f => {
            options.push({ label: f, value: f });
        });
        return options;
    }

    handleFamilyChange(event) {
        this.selectedFamily = event.detail.value;
        if (this.searchTerm.length >= 2) {
            this._executeSearch();
        }
    }

    // ─── SEARCH LOGIC ─────────────────────────────────────────────
    handleSearchInput(event) {
        this.searchTerm = event.target.value;
        clearTimeout(this._debounceTimer);

        if (this.searchTerm.length >= 2) {
            this._debounceTimer = setTimeout(() => {
                this._executeSearch();
            }, SEARCH_DEBOUNCE_MS);
        } else {
            this.searchResults = [];
            this.hasSearched = false;
        }
    }

    async _executeSearch() {
        this.isSearching = true;
        this.hasSearched = true;
        try {
            let results = await searchProducts({
                searchTerm: this.searchTerm,
                quoteId: this.quoteId
            });

            // Client-side family filter
            if (this.selectedFamily) {
                results = results.filter(r => r.family === this.selectedFamily);
            }

            // Enrich results with UI state
            this.searchResults = results.map(r => ({
                ...r,
                displayImage: r.imageUrl || PLACEHOLDER_IMAGE,
                isSelected: this.selectedIds.has(r.pricebookEntryId),
                cardClass: this.selectedIds.has(r.pricebookEntryId)
                    ? 'product-card product-card-selected'
                    : 'product-card'
            }));
        } catch (error) {
            console.error('Search error:', error);
            this.searchResults = [];
        } finally {
            this.isSearching = false;
        }
    }

    // ─── SELECTION ────────────────────────────────────────────────
    handleProductSelect(event) {
        const pbeId = event.currentTarget.dataset.id;
        if (this.selectedIds.has(pbeId)) {
            this.selectedIds.delete(pbeId);
        } else {
            this.selectedIds.add(pbeId);
        }
        // Re-render results with selection state
        this.searchResults = this.searchResults.map(r => ({
            ...r,
            isSelected: this.selectedIds.has(r.pricebookEntryId),
            cardClass: this.selectedIds.has(r.pricebookEntryId)
                ? 'product-card product-card-selected'
                : 'product-card'
        }));
    }

    // ─── ADD TO QUOTE ─────────────────────────────────────────────
    async handleAddSelected() {
        if (this.selectedIds.size === 0) return;

        this.isSearching = true;
        try {
            const entryIds = [...this.selectedIds];
            await addProductsToQuote({
                quoteId: this.quoteId,
                pricebookEntryIds: entryIds
            });
            // Close modal and signal success to parent
            this.close({ action: 'added', count: entryIds.length });
        } catch (error) {
            console.error('Error adding products:', error);
            this.close({ action: 'error', message: error.body?.message || 'Unknown error' });
        } finally {
            this.isSearching = false;
        }
    }

    handleCancel() {
        this.close({ action: 'cancelled' });
    }

    // ─── COMPUTED GETTERS ─────────────────────────────────────────
    get hasResults() {
        return this.searchResults.length > 0;
    }

    get hasSelections() {
        return this.selectedIds.size > 0;
    }

    get selectionCountLabel() {
        return `${this.selectedIds.size} selected`;
    }

    get addButtonDisabled() {
        return this.selectedIds.size === 0 || this.isSearching;
    }
}
