import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

import QUOTE_NAME_FIELD from '@salesforce/schema/Quote.Name';
import QUOTE_NUMBER_FIELD from '@salesforce/schema/Quote.QuoteNumber';
import QUOTE_EXPIRATION_FIELD from '@salesforce/schema/Quote.ExpirationDate';
import QUOTE_SYNCING_FIELD from '@salesforce/schema/Quote.IsSyncing';
import QUOTE_GRAND_TOTAL_FIELD from '@salesforce/schema/Quote.GrandTotal';
import QUOTE_OPP_ID_FIELD from '@salesforce/schema/Quote.OpportunityId';
import QUOTE_ACC_ID_FIELD from '@salesforce/schema/Quote.AccountId';

const OPP_NAME_FIELD = 'Quote.Opportunity.Name';
const ACC_NAME_FIELD = 'Quote.Account.Name';

const FIELDS = [
    QUOTE_NAME_FIELD, QUOTE_NUMBER_FIELD, QUOTE_EXPIRATION_FIELD, QUOTE_SYNCING_FIELD, 
    QUOTE_GRAND_TOTAL_FIELD, QUOTE_OPP_ID_FIELD, QUOTE_ACC_ID_FIELD,
    OPP_NAME_FIELD, ACC_NAME_FIELD
];

export default class QuoteRefinedHeader extends LightningElement {
    @api recordId;
    
    // THE FIX: Assign default strings right here in the JS!
    @api primaryButtons = 'New Contact, New Opportunity, New Lead';
    @api dropdownMenuActions = 'Edit, Delete, Change Owner, Clone, Generate PDF, Submit for Approval';

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    quote;


    // --- Data Getters ---
    get quoteName() { return getFieldValue(this.quote.data, QUOTE_NAME_FIELD) || 'Loading...'; }
    get quoteNumber() { return getFieldValue(this.quote.data, QUOTE_NUMBER_FIELD) || '--'; }
    get expirationDate() { return getFieldValue(this.quote.data, QUOTE_EXPIRATION_FIELD) || '--'; }
    get isSyncingText() { return getFieldValue(this.quote.data, QUOTE_SYNCING_FIELD) ? 'Yes' : 'No'; }
    get opportunityName() { return getFieldValue(this.quote.data, OPP_NAME_FIELD) || '--'; }
    get accountName() { return getFieldValue(this.quote.data, ACC_NAME_FIELD) || '--'; }

    get formattedGrandTotal() {
        const total = getFieldValue(this.quote.data, QUOTE_GRAND_TOTAL_FIELD);
        if (total === undefined || total === null) return '₹0.00';
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(total);
    }

    // --- DYNAMIC ACTION GENERATORS ---

    get visibleActionList() {
        if (!this.primaryButtons) return [];
        // Takes "New Contact, Edit" -> creates an array: ['New Contact', 'Edit']
        return this.primaryButtons.split(',').map(btn => btn.trim()).filter(btn => btn !== '');
    }

    get dropdownActionList() {
        if (!this.dropdownMenuActions) return [];
        // Takes list and creates an object for the menu: { label: 'Edit', value: 'edit' }
        return this.dropdownMenuActions.split(',').map(action => {
            const cleanAction = action.trim();
            return {
                label: cleanAction,
                value: cleanAction.toLowerCase().replace(/\s+/g, '_') // replaces spaces with underscores
            };
        }).filter(action => action.label !== '');
    }

    // --- Action Handlers ---
    handleMainAction(event) {
        const action = event.target.dataset.action;
        this.dispatchEvent(new ShowToastEvent({ title: 'Action Clicked', message: `You clicked ${action}`, variant: 'info' }));
    }

    handleMenuSelect(event) {
        const selectedItemValue = event.detail.value;
        this.dispatchEvent(new ShowToastEvent({ title: 'Menu Item Selected', message: `You selected: ${selectedItemValue}`, variant: 'success' }));
    }
}