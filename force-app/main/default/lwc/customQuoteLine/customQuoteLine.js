import { LightningElement, api, wire, track } from 'lwc';
import { getRelatedListRecords } from 'lightning/uiRelatedListApi';
import { updateRecord, deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation'; 

export default class AdvancedQuoteLineEditor extends NavigationMixin(LightningElement) {
    @api recordId;
    @track lineItems = [];
    @track originalLineItems = []; 
    @track isLoading = true;
    @track draftValues = {}; 
    @track isInstantPricingEnabled = false;

    // UX STATE MANAGEMENT
    get displayedLineItems() { return this.lineItems.slice(0, 5); }
    get hasMoreItems() { return this.lineItems.length > 5; }
    get isDirty() { return Object.keys(this.draftValues).length > 0; }

    @wire(getRelatedListRecords, {
        parentRecordId: '$recordId',
        relatedListId: 'QuoteLineItems',
        fields: [
            'QuoteLineItem.Id', 
            'QuoteLineItem.Quantity', 
            'QuoteLineItem.UnitPrice',
            'QuoteLineItem.Subtotal', /* NEW FIELD FETCHED */
            'QuoteLineItem.TotalPrice', 
            'QuoteLineItem.Discount', 
            'QuoteLineItem.Description',
            'QuoteLineItem.Product2.Name', 
            'QuoteLineItem.Product2.DisplayUrl'
        ]
    })
    wiredLines({ error, data }) {
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
                    subtotal: getVal('Subtotal') || 0, /* MAPPED NEW FIELD */
                    discount: rawDiscount ? `${rawDiscount}%` : '--',
                    totalPrice: getVal('TotalPrice') || 0
                };
            });
            this.lineItems = [...parsedItems];
            this.originalLineItems = JSON.parse(JSON.stringify(parsedItems)); 
            this.draftValues = {}; 
            this.isLoading = false;
        } else if (error) {
            console.error('Error fetching lines:', error);
            this.isLoading = false;
        }
    }

    handleQuantityChange(event) {
        const itemId = event.target.dataset.itemId;
        const newQty = parseFloat(event.target.value) || 0;
        this.draftValues[itemId] = newQty; 
        
        // Instant visual recalculation (approximated for UX)
        this.lineItems = this.lineItems.map(item => {
            if (item.id === itemId) {
                const newSub = newQty * item.unitPrice;
                // Note: Standard CPQ/SF handles deep discount math, we just update the base visual here
                return { ...item, quantity: newQty, subtotal: newSub };
            }
            return item;
        });
    }

    handleCancel() {
        this.draftValues = {};
        this.lineItems = JSON.parse(JSON.stringify(this.originalLineItems)); 
    }

    // --- CPQ-STYLE HEADER ACTIONS ---
    handleInstantPricingToggle(event) {
        this.isInstantPricingEnabled = event.target.checked;
        this.showToast('Instant Pricing', `Engine is now ${this.isInstantPricingEnabled ? 'ON' : 'OFF'}. (Requires Apex API integration)`, 'info');
    }

    handleBulkDelete() { this.showToast('Bulk Delete', 'Select lines first. (Requires custom logic implementation)', 'warning'); }
    handleAddGroup() { this.showToast('Add Group', 'Quote Line Grouping requires CPQ backend logic.', 'warning'); }
    
    handleRepriceAll() {
        this.isLoading = true;
        setTimeout(() => {
            this.showToast('Reprice All', 'Pricing engine simulated. (Requires Apex integration)', 'success');
            this.isLoading = false;
        }, 1000);
    }

    handleProductSearch(event) {
        const searchTerm = event.target.value;
        if (searchTerm.length > 2) {
            console.log(`Searching database for: ${searchTerm}`);
        }
    }

    // --- STANDARD ROW ACTIONS ---
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
                    this.isLoading = false;
                })
                .catch(error => {
                    this.showToast('Error', error.body.message, 'error');
                    this.isLoading = false;
                });
        }
    }

    handleSaveChanges() {
        this.isLoading = true;
        const recordInputs = Object.keys(this.draftValues).map(id => {
            return { fields: { Id: id, Quantity: this.draftValues[id] } };
        });

        const promises = recordInputs.map(recordInput => updateRecord(recordInput));

        Promise.all(promises)
            .then(() => {
                this.showToast('Success', 'Cart updated successfully.', 'success');
                this.draftValues = {}; 
                this.originalLineItems = JSON.parse(JSON.stringify(this.lineItems)); 
                this.isLoading = false;
            })
            .catch(error => {
                this.showToast('Error', 'Failed to update.', 'error');
                this.isLoading = false;
            });
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}