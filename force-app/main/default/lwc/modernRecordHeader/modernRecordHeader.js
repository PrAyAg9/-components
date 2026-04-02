import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import { deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { refreshApex } from '@salesforce/apex';

// Apex for server-side operations
import submitForApproval from '@salesforce/apex/QuoteActionService.submitForApproval';

// Product Search Modal
import ProductSearchModal from 'c/productSearchModal';

// Schema imports
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
    
    // Configurable from App Builder — Updated defaults for Revenue Cloud
    @api primaryButtons = 'Browse Catalog, Create Contact, Edit';
    @api dropdownMenuActions = 'Delete, Clone, Change Owner, Submit for Approval, Generate PDF';

    _wiredQuoteResult; // Store for refreshApex

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredQuote(result) {
        this._wiredQuoteResult = result;
        this.quote = result;
    }
    quote;

    // --- Data Getters ---
    get quoteName() { return getFieldValue(this.quote.data, QUOTE_NAME_FIELD) || 'Loading...'; }
    get quoteNumber() { return getFieldValue(this.quote.data, QUOTE_NUMBER_FIELD) || '--'; }
    get expirationDate() { return getFieldValue(this.quote.data, QUOTE_EXPIRATION_FIELD) || '--'; }
    get isSyncingText() { return getFieldValue(this.quote.data, QUOTE_SYNCING_FIELD) ? 'Yes' : 'No'; }
    
    // Lookups
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

    // Account/Opp links
    navigateToRecord(event) {
        const targetId = event.currentTarget.dataset.id;
        if (targetId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: { recordId: targetId, actionName: 'view' }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // THE MASTER ROUTER — Every button/action goes through here
    // ═══════════════════════════════════════════════════════════════
    routeAction(actionName) {
        const actionKey = actionName.toLowerCase().replace(/\s+/g, '_');

        switch(actionKey) {
            // ─── BROWSE CATALOG (opens the product search modal) ──
            case 'browse_catalog':
            case 'browse_products':
            case 'search_products':
                this.handleBrowseCatalog();
                break;

            // ─── EDIT ─────────────────────────────────────────────
            case 'edit':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: this.recordId, actionName: 'edit' }
                });
                break;

            // ─── CLONE ────────────────────────────────────────────
            case 'clone':
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: { recordId: this.recordId, objectApiName: 'Quote', actionName: 'clone' }
                });
                break;

            // ─── DELETE ───────────────────────────────────────────
            case 'delete':
                deleteRecord(this.recordId)
                    .then(() => {
                        this.showToast('Success', 'Quote deleted.', 'success');
                        this[NavigationMixin.Navigate]({
                            type: 'standard__objectPage',
                            attributes: { objectApiName: 'Quote', actionName: 'home' }
                        });
                    })
                    .catch(error => this.showToast('Error', error.body.message, 'error'));
                break;

            // ─── CREATE CONTACT ───────────────────────────────────
            case 'create_contact':
            case 'new_contact':
                this[NavigationMixin.Navigate]({
                    type: 'standard__objectPage',
                    attributes: { objectApiName: 'Contact', actionName: 'new' }
                });
                break;

            // ─── NEW OPPORTUNITY ──────────────────────────────────
            case 'new_opportunity':
                this[NavigationMixin.Navigate]({
                    type: 'standard__objectPage',
                    attributes: { objectApiName: 'Opportunity', actionName: 'new' }
                });
                break;

            // ─── NEW LEAD ─────────────────────────────────────────
            case 'new_lead':
                this[NavigationMixin.Navigate]({
                    type: 'standard__objectPage',
                    attributes: { objectApiName: 'Lead', actionName: 'new' }
                });
                break;

            // ─── CHANGE OWNER ─────────────────────────────────────
            case 'change_owner':
                // Navigate to the standard Change Owner page
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: { url: `/lightning/o/Quote/${this.recordId}/changeOwner` }
                });
                break;

            // ─── SUBMIT FOR APPROVAL ──────────────────────────────
            case 'submit_for_approval':
                this.handleSubmitForApproval();
                break;

            // ─── GENERATE PDF ─────────────────────────────────────
            case 'generate_pdf':
            case 'create_pdf':
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: { url: `/quote/quoteTemplateDataViewer.apexp?id=${this.recordId}` }
                });
                break;

            // ─── SEND EMAIL ───────────────────────────────────────
            case 'send_email':
            case 'email':
                this[NavigationMixin.Navigate]({
                    type: 'standard__quickAction',
                    attributes: {
                        apiName: 'SendEmail'
                    }
                });
                break;

            // ─── UNKNOWN / CUSTOM ─────────────────────────────────
            default:
                this.showToast('Action Info', `The action "${actionName}" is available. Configure it in App Builder or add a case in routeAction().`, 'info');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // BROWSE CATALOG — Opens the product search modal
    // ═══════════════════════════════════════════════════════════════
    async handleBrowseCatalog() {
        const result = await ProductSearchModal.open({
            label: 'Browse Product Catalog',
            size: 'large',
            quoteId: this.recordId
        });

        if (result && result.action === 'added') {
            this.showToast('Products Added', `${result.count} product(s) added to the quote.`, 'success');
            // Refresh the quote data to update Grand Total
            await refreshApex(this._wiredQuoteResult);
        } else if (result && result.action === 'error') {
            this.showToast('Error', result.message, 'error');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // SUBMIT FOR APPROVAL — Real Apex call
    // ═══════════════════════════════════════════════════════════════
    async handleSubmitForApproval() {
        try {
            const result = await submitForApproval({ quoteId: this.recordId });
            if (result === 'Success') {
                this.showToast('Submitted', 'Quote submitted for approval successfully.', 'success');
                await refreshApex(this._wiredQuoteResult);
            } else {
                this.showToast('Warning', result, 'warning');
            }
        } catch (error) {
            this.showToast('Error', error.body?.message || 'Failed to submit for approval. Ensure an Approval Process is configured for Quote.', 'error');
        }
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}