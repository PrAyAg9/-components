import { LightningElement, api, wire, track } from 'lwc';
import { getRelatedListRecords } from 'lightning/uiRelatedListApi';
import { updateRecord, deleteRecord } from 'lightning/uiRecordApi';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation'; 

// Apex for real backend operations
import searchProducts from '@salesforce/apex/QuoteActionService.searchProducts';
import addProductsToQuote from '@salesforce/apex/QuoteActionService.addProductsToQuote';
import bulkDeleteLineItems from '@salesforce/apex/QuoteActionService.bulkDeleteLineItems';
import repriceQuote from '@salesforce/apex/QuoteActionService.repriceQuote';
import updateLineItems from '@salesforce/apex/QuoteActionService.updateLineItems';


const SEARCH_DEBOUNCE_MS = 400;

export default class AdvancedQuoteLineEditor extends NavigationMixin(LightningElement) {
    @api recordId;
    @track lineItems = [];
    @track originalLineItems = []; 
    @track isLoading = true;
    @track draftValues = {}; 
    @track isInstantPricingEnabled = false;

    // Selection state for bulk operations
    @track selectedItemIds = new Set();
    @track selectAll = false;

    // Product search state
    @track searchTerm = '';
    @track searchResults = [];
    @track isSearchDropdownOpen = false;
    @track isSearching = false;
    _searchDebounceTimer;

    // Store wired result for refresh
    _wiredLineResult;

    // ─── UX STATE MANAGEMENT ──────────────────────────────────────
    get displayedLineItems() { return this.lineItems.slice(0, 5); }
    get hasMoreItems() { return this.lineItems.length > 5; }
    get isDirty() { return Object.keys(this.draftValues).length > 0; }
    get hasSelections() { return this.selectedItemIds.size > 0; }
    get selectionCount() { return this.selectedItemIds.size; }
    get bulkDeleteLabel() { 
        return this.selectedItemIds.size > 0 
            ? `Delete (${this.selectedItemIds.size})` 
            : 'Bulk Delete'; 
    }

    // ─── DATA WIRE ────────────────────────────────────────────────
    @wire(getRelatedListRecords, {
        parentRecordId: '$recordId',
        relatedListId: 'QuoteLineItems',
        fields: [
            'QuoteLineItem.Id', 
            'QuoteLineItem.Quantity', 
            'QuoteLineItem.UnitPrice',
            'QuoteLineItem.Subtotal',
            'QuoteLineItem.TotalPrice', 
            'QuoteLineItem.Discount', 
            'QuoteLineItem.Description',
            'QuoteLineItem.Product2.Name', 
            'QuoteLineItem.Product2.DisplayUrl'
        ]
    })
    wiredLines(result) {
        this._wiredLineResult = result;
        const { data, error } = result;
        if (data) {
            const parsedItems = data.records.map(record => {
                const getVal = (field) => record.fields[field] ? record.fields[field].value : null;
                const getRelVal = (rel, field) => record.fields[rel] && record.fields[rel].value ? record.fields[rel].value.fields[field].value : null;
                const rawDiscount = getVal('Discount');
                
                return {
                    id: record.id,
                    name: getRelVal('Product2', 'Name') || 'Unknown Product',
                    image: getRelVal('Product2', 'DisplayUrl') || 'https://via.placeholder.com/150/f8f9fa/c9c9c9?text=No+Image',
                    description: getVal('Description') || '',
                    unitPrice: getVal('UnitPrice') || 0,
                    quantity: getVal('Quantity') || 0,
                    subtotal: getVal('Subtotal') || 0,
                    discount: rawDiscount ? `${rawDiscount}%` : '--',
                    totalPrice: getVal('TotalPrice') || 0,
                    isSelected: false
                };
            });
            this.lineItems = [...parsedItems];
            this.originalLineItems = JSON.parse(JSON.stringify(parsedItems)); 
            this.draftValues = {}; 
            this.selectedItemIds = new Set();
            this.selectAll = false;
            this.isLoading = false;
        } else if (error) {
            console.error('Error fetching lines:', error);
            this.isLoading = false;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // QUANTITY CHANGE — with optional Instant Pricing
    // ═══════════════════════════════════════════════════════════════
    handleQuantityChange(event) {
        const itemId = event.target.dataset.itemId;
        const newQty = parseFloat(event.target.value) || 0;
        this.draftValues[itemId] = newQty; 
        
        // Instant visual recalculation
        this.lineItems = this.lineItems.map(item => {
            if (item.id === itemId) {
                const newSub = newQty * item.unitPrice;
                return { ...item, quantity: newQty, subtotal: newSub };
            }
            return item;
        });

        // If Instant Pricing is ON, auto-save after a small delay
        if (this.isInstantPricingEnabled) {
            clearTimeout(this._instantPriceTimer);
            this._instantPriceTimer = setTimeout(() => {
                this._saveAndReprice();
            }, 1500);
        }
    }

    handleCancel() {
        this.draftValues = {};
        this.lineItems = JSON.parse(JSON.stringify(this.originalLineItems)); 
        this.showToast('Cancelled', 'Changes discarded.', 'info');
    }

    // ═══════════════════════════════════════════════════════════════
    // INSTANT PRICING TOGGLE — Real behavior
    // ═══════════════════════════════════════════════════════════════
    handleInstantPricingToggle(event) {
        this.isInstantPricingEnabled = event.target.checked;
        if (this.isInstantPricingEnabled) {
            this.showToast('Instant Pricing ON', 'Prices will auto-update when you change quantities. Admin pricing rules will apply.', 'success');
        } else {
            this.showToast('Instant Pricing OFF', 'Changes will only save when you click "Save Changes".', 'info');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // BULK DELETE — Real deletion via Apex
    // ═══════════════════════════════════════════════════════════════
    handleBulkDelete() {
        if (this.selectedItemIds.size === 0) {
            this.showToast('No Selection', 'Select line items using checkboxes first, then click Delete.', 'warning');
            return;
        }

        this.isLoading = true;
        const idsToDelete = [...this.selectedItemIds];

        bulkDeleteLineItems({ lineItemIds: idsToDelete })
            .then(() => {
                this.showToast('Deleted', `${idsToDelete.length} line item(s) removed.`, 'success');
                this.selectedItemIds = new Set();
                this.selectAll = false;
                return refreshApex(this._wiredLineResult);
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to delete line items.', 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD GROUP — Prompt for group name and organize items
    // ═══════════════════════════════════════════════════════════════
    handleAddGroup() {
        // Use a simple approach: show toast guidance
        // In real Revenue Cloud orgs, grouping is handled via the standard CPQ framework
        this.showToast(
            'Add Group', 
            'To create line groups, select line items and use the standard Quote Line Editor from the admin setup. Groups are managed through Revenue Cloud configuration.', 
            'info'
        );
    }
    
    // ═══════════════════════════════════════════════════════════════
    // REPRICE ALL — Real Apex call to trigger pricing engine
    // ═══════════════════════════════════════════════════════════════
    handleRepriceAll() {
        this.isLoading = true;

        repriceQuote({ quoteId: this.recordId })
            .then(result => {
                if (result === 'Success') {
                    this.showToast('Repriced', 'All line items have been repriced using the pricing engine. Admin pricing rules applied.', 'success');
                } else {
                    this.showToast('Info', result, 'info');
                }
                this.draftValues = {};
                return refreshApex(this._wiredLineResult);
            })
            .catch(error => {
                this.showToast('Reprice Failed', error.body?.message || 'Something went wrong during repricing.', 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ═══════════════════════════════════════════════════════════════
    // PRODUCT SEARCH — Live search with dropdown results
    // ═══════════════════════════════════════════════════════════════
    handleProductSearch(event) {
        this.searchTerm = event.target.value;
        clearTimeout(this._searchDebounceTimer);

        if (this.searchTerm.length < 2) {
            this.searchResults = [];
            this.isSearchDropdownOpen = false;
            return;
        }

        this._searchDebounceTimer = setTimeout(() => {
            this._performSearch();
        }, SEARCH_DEBOUNCE_MS);
    }

    async _performSearch() {
        this.isSearching = true;
        this.isSearchDropdownOpen = true;
        try {
            const results = await searchProducts({
                searchTerm: this.searchTerm,
                quoteId: this.recordId
            });
            this.searchResults = results.map(r => ({
                ...r,
                displayImage: r.imageUrl || 'https://via.placeholder.com/40/f1f5f9/94a3b8?text=P'
            }));
        } catch (error) {
            console.error('Search error:', error);
            this.searchResults = [];
        } finally {
            this.isSearching = false;
        }
    }

    // Add a single product from search dropdown
    handleAddFromSearch(event) {
        const pbeId = event.currentTarget.dataset.id;
        this.isSearchDropdownOpen = false;
        this.searchTerm = '';
        this.searchResults = [];
        this.isLoading = true;

        addProductsToQuote({ quoteId: this.recordId, pricebookEntryIds: [pbeId] })
            .then(() => {
                this.showToast('Product Added', 'Line item added to the quote.', 'success');
                return refreshApex(this._wiredLineResult);
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to add product.', 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // Close search dropdown when clicking outside
    handleSearchBlur() {
        // Delay to allow click events on dropdown items to fire first
        setTimeout(() => {
            this.isSearchDropdownOpen = false;
        }, 300);
    }

    // ═══════════════════════════════════════════════════════════════
    // PRODUCT NAME CLICK — Navigate to QuoteLineItem detail page
    // ═══════════════════════════════════════════════════════════════
    handleProductNameClick(event) {
        const itemId = event.currentTarget.dataset.itemId;
        if (itemId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: itemId,
                    objectApiName: 'QuoteLineItem',
                    actionName: 'view'
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ROW SELECTION — Checkboxes for bulk operations
    // ═══════════════════════════════════════════════════════════════
    handleRowSelect(event) {
        const itemId = event.target.dataset.itemId;
        const isChecked = event.target.checked;

        if (isChecked) {
            this.selectedItemIds.add(itemId);
        } else {
            this.selectedItemIds.delete(itemId);
        }

        // Update the visual state
        this.lineItems = this.lineItems.map(item => ({
            ...item,
            isSelected: this.selectedItemIds.has(item.id)
        }));

        // Update select-all checkbox state
        this.selectAll = this.selectedItemIds.size === this.lineItems.length && this.lineItems.length > 0;
    }

    handleSelectAll(event) {
        this.selectAll = event.target.checked;
        if (this.selectAll) {
            this.lineItems.forEach(item => this.selectedItemIds.add(item.id));
        } else {
            this.selectedItemIds = new Set();
        }
        
        this.lineItems = this.lineItems.map(item => ({
            ...item,
            isSelected: this.selectAll
        }));
    }

    // ═══════════════════════════════════════════════════════════════
    // ROW ACTIONS — View, Edit, Delete (individual)
    // ═══════════════════════════════════════════════════════════════
    handleRowAction(event) {
        const action = event.detail.value;
        const itemId = event.target.dataset.itemId;

        if (action === 'view' || action === 'edit') {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: itemId, objectApiName: 'QuoteLineItem', actionName: action }
            });
        } 
        else if (action === 'delete') {
            this.isLoading = true;
            deleteRecord(itemId)
                .then(() => {
                    this.showToast('Deleted', 'Line item removed.', 'success');
                    return refreshApex(this._wiredLineResult);
                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                })
                .finally(() => {
                    this.isLoading = false;
                });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SAVE CHANGES — Batch update via Apex (triggers admin pricing)
    // ═══════════════════════════════════════════════════════════════
    handleSaveChanges() {
        this.isLoading = true;
        
        const itemsToUpdate = Object.keys(this.draftValues).map(id => ({
            Id: id,
            Quantity: this.draftValues[id]
        }));

        updateLineItems({ lineItemsJson: JSON.stringify(itemsToUpdate) })
            .then(() => {
                this.showToast('Success', 'Cart updated successfully. Pricing rules applied.', 'success');
                this.draftValues = {}; 
                return refreshApex(this._wiredLineResult);
            })
            .catch(error => {
                this.showToast('Error', error.body?.message || 'Failed to update.', 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // Internal: Save current drafts and reprice (for Instant Pricing)
    async _saveAndReprice() {
        if (Object.keys(this.draftValues).length === 0) return;
        
        try {
            const itemsToUpdate = Object.keys(this.draftValues).map(id => ({
                Id: id,
                Quantity: this.draftValues[id]
            }));
            await updateLineItems({ lineItemsJson: JSON.stringify(itemsToUpdate) });
            await repriceQuote({ quoteId: this.recordId });
            this.draftValues = {};
            await refreshApex(this._wiredLineResult);
        } catch (error) {
            console.error('Instant pricing error:', error);
        }
    }

    // View All link
    handleHeaderAction() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordRelatedListPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: 'Quote',
                relationshipApiName: 'QuoteLineItems',
                actionName: 'view'
            }
        });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}