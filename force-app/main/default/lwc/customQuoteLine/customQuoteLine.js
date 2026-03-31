import { LightningElement, api, wire, track } from 'lwc';
import { getRelatedListRecords } from 'lightning/uiRelatedListApi';
import { updateRecord, deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation'; // UNLOCKS STANDARD NAVIGATION

export default class AdvancedQuoteLineEditor extends NavigationMixin(LightningElement) {
    @api recordId;
    @track lineItems = [];
    @track isLoading = true;
    @track draftValues = {}; 

    @wire(getRelatedListRecords, {
        parentRecordId: '$recordId',
        relatedListId: 'QuoteLineItems',
        fields: [
            'QuoteLineItem.Id',
            'QuoteLineItem.Quantity',
            'QuoteLineItem.UnitPrice',
            'QuoteLineItem.TotalPrice',
            'QuoteLineItem.Discount',
            'QuoteLineItem.Description',
            'QuoteLineItem.Product2.Name',
            'QuoteLineItem.Product2.DisplayUrl'
        ]
    })
    wiredLines({ error, data }) {
        if (data) {
            this.lineItems = data.records.map(record => {
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
                    discount: rawDiscount ? `${rawDiscount}%` : '--',
                    totalPrice: getVal('TotalPrice') || 0
                };
            });
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

        this.lineItems = this.lineItems.map(item => {
            if (item.id === itemId) {
                return { ...item, quantity: newQty, totalPrice: newQty * item.unitPrice };
            }
            return item;
        });
    }

    // --- STANDARD NAVIGATIONS (REAL FUNCTIONALITY) ---

    handleRowAction(event) {
        const action = event.detail.value;
        const itemId = event.target.dataset.itemId;

        if (action === 'view') {
            // Opens the standard record view page
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: itemId, objectApiName: 'QuoteLineItem', actionName: 'view' }
            });
        } 
        else if (action === 'edit') {
            // Opens the standard Salesforce Edit Modal
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: itemId, objectApiName: 'QuoteLineItem', actionName: 'edit' }
            });
        } 
        else if (action === 'delete') {
            // Deletes the record via UI API
            this.isLoading = true;
            deleteRecord(itemId)
                .then(() => {
                    this.dispatchEvent(new ShowToastEvent({ title: 'Deleted', message: 'Line item removed.', variant: 'success' }));
                    this.isLoading = false;
                    // LDS cache automatically refreshes the wire!
                })
                .catch(error => {
                    this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body.message, variant: 'error' }));
                    this.isLoading = false;
                });
        }
    }

    handleHeaderAction(event) {
        const action = event.target.dataset.action;
        
        if (action === 'Browse Catalog') {
            // Navigates to the standard Quote Line Items related list where standard "Add Products" lives
            this[NavigationMixin.Navigate]({
                type: 'standard__recordRelationshipPage',
                attributes: { recordId: this.recordId, objectApiName: 'Quote', relationshipApiName: 'QuoteLineItems', actionName: 'view' }
            });
        } else if (action === 'Edit Products') {
             // For standard multi-line editing, routing to the related list is the safest universal method across orgs
            this[NavigationMixin.Navigate]({
                type: 'standard__recordRelationshipPage',
                attributes: { recordId: this.recordId, objectApiName: 'Quote', relationshipApiName: 'QuoteLineItems', actionName: 'view' }
            });
        }
    }

    handleSaveChanges() {
        this.isLoading = true;
        const recordInputs = Object.keys(this.draftValues).map(id => {
            return { fields: { Id: id, Quantity: this.draftValues[id] } };
        });

        if (recordInputs.length === 0) {
            this.isLoading = false;
            return;
        }

        const promises = recordInputs.map(recordInput => updateRecord(recordInput));

        Promise.all(promises)
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Cart updated successfully.', variant: 'success' }));
                this.draftValues = {}; 
                this.isLoading = false;
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: 'Failed to update.', variant: 'error' }));
                this.isLoading = false;
            });
    }
}