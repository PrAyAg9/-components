import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation'; // UNLOCKS STANDARD ROUTING

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

export default class QuoteRefinedHeader extends NavigationMixin(LightningElement) {
    @api recordId;
    
    @api primaryButtons = 'New Contact, New Opportunity, New Lead';
    @api dropdownMenuActions = 'Edit, Delete, Clone, Generate PDF';

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    quote;

    // --- Data Getters ---
    get quoteName() { return getFieldValue(this.quote.data, QUOTE_NAME_FIELD) || 'Loading...'; }
    get quoteNumber() { return getFieldValue(this.quote.data, QUOTE_NUMBER_FIELD) || '--'; }
    get expirationDate() { return getFieldValue(this.quote.data, QUOTE_EXPIRATION_FIELD) || '--'; }
    get isSyncingText() { return getFieldValue(this.quote.data, QUOTE_SYNCING_FIELD) ? 'Yes' : 'No'; }
    
    // Lookups (Text and IDs for clicking)
    get opportunityName() { return getFieldValue(this.quote.data, OPP_NAME_FIELD) || '--'; }
    get opportunityId() { return getFieldValue(this.quote.data, QUOTE_OPP_ID_FIELD); }
    get accountName() { return getFieldValue(this.quote.data, ACC_NAME_FIELD) || '--'; }
    get accountId() { return getFieldValue(this.quote.data, QUOTE_ACC_ID_FIELD); }

    get formattedGrandTotal() {
        const total = getFieldValue(this.quote.data, QUOTE_GRAND_TOTAL_FIELD);
        if (total === undefined || total === null) return '₹0.00';
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(total);
    }

    // --- DYNAMIC ACTION GENERATORS ---
    get visibleActionList() {
        if (!this.primaryButtons) return [];
        return this.primaryButtons.split(',').map(btn => btn.trim()).filter(btn => btn !== '');
    }

    get dropdownActionList() {
        if (!this.dropdownMenuActions) return [];
        return this.dropdownMenuActions.split(',').map(action => {
            const cleanAction = action.trim();
            return {
                label: cleanAction,
                value: cleanAction.toLowerCase().replace(/\s+/g, '_')
            };
        }).filter(action => action.label !== '');
    }

    // --- NAVIGATION ENGINE ---
    handleMainAction(event) {
        const action = event.target.dataset.action;
        this.routeAction(action);
    }

    handleMenuSelect(event) {
        const action = event.detail.value;
        this.routeAction(action);
    }

    // Makes the Account/Opp links actually work
    navigateToRecord(event) {
        const targetId = event.currentTarget.dataset.id;
        if (targetId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: targetId, actionName: 'view' }
            });
        }
    }

    // The Master Router: Translates string text into Standard Salesforce Actions
    routeAction(actionName) {
        const actionKey = actionName.toLowerCase().replace(/\s+/g, '_');

        switch(actionKey) {
            case 'edit':
                this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: this.recordId, actionName: 'edit' } });
                break;
            case 'clone':
                this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: this.recordId, objectApiName: 'Quote', actionName: 'clone' } });
                break;
            case 'delete':
                deleteRecord(this.recordId)
                    .then(() => {
                        this.showToast('Success', 'Quote deleted.', 'success');
                        this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Quote', actionName: 'home' } });
                    })
                    .catch(error => this.showToast('Error', error.body.message, 'error'));
                break;
            case 'new_contact':
                this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Contact', actionName: 'new' } });
                break;
            case 'new_opportunity':
                this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Opportunity', actionName: 'new' } });
                break;
            case 'new_lead':
                this[NavigationMixin.Navigate]({ type: 'standard__objectPage', attributes: { objectApiName: 'Lead', actionName: 'new' } });
                break;
            case 'generate_pdf':
            case 'create_pdf':
                // Standard SF Quote PDF generator URL
                this[NavigationMixin.Navigate]({ type: 'standard__webPage', attributes: { url: `/quote/quoteTemplateDataViewer.apexp?id=${this.recordId}` } });
                break;
            default:
                this.showToast('Action Not Wired', `The action "${actionName}" requires custom Apex/Flow integration.`, 'info');
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}