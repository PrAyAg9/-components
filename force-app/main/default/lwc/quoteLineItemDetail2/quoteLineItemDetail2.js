import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue, deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

// ─── Import field tokens (safest way for getRecord) ──────────
import FIELD_QUANTITY from '@salesforce/schema/QuoteLineItem.Quantity';
import FIELD_UNIT_PRICE from '@salesforce/schema/QuoteLineItem.UnitPrice';
import FIELD_SUBTOTAL from '@salesforce/schema/QuoteLineItem.Subtotal';
import FIELD_TOTAL_PRICE from '@salesforce/schema/QuoteLineItem.TotalPrice';
import FIELD_DISCOUNT from '@salesforce/schema/QuoteLineItem.Discount';
import FIELD_DESCRIPTION from '@salesforce/schema/QuoteLineItem.Description';
import FIELD_LIST_PRICE from '@salesforce/schema/QuoteLineItem.ListPrice';
import FIELD_QUOTE_ID from '@salesforce/schema/QuoteLineItem.QuoteId';
import FIELD_PRODUCT2_ID from '@salesforce/schema/QuoteLineItem.Product2Id';

// ─── Required fields (core QLI fields — always exist) ────────
const REQUIRED_FIELDS = [
    FIELD_QUANTITY,
    FIELD_UNIT_PRICE,
    FIELD_SUBTOTAL,
    FIELD_TOTAL_PRICE,
    FIELD_DISCOUNT,
    FIELD_DESCRIPTION,
    FIELD_LIST_PRICE,
    FIELD_QUOTE_ID,
    FIELD_PRODUCT2_ID
];

// ─── Optional fields (spanning + audit — won't break if missing) ─
const OPTIONAL_FIELDS = [
    'QuoteLineItem.LineItemNumber',
    'QuoteLineItem.ServiceDate',
    // Product2 spanning fields
    'QuoteLineItem.Product2.Name',
    'QuoteLineItem.Product2.Description',
    'QuoteLineItem.Product2.Family',
    'QuoteLineItem.Product2.ProductCode',
    'QuoteLineItem.Product2.DisplayUrl',
    'QuoteLineItem.Product2.IsActive',
    'QuoteLineItem.Product2.QuantityUnitOfMeasure',
    // Quote spanning fields
    'QuoteLineItem.Quote.Name',
    'QuoteLineItem.Quote.QuoteNumber',
    'QuoteLineItem.Quote.Status',
    // Audit fields
    'QuoteLineItem.CreatedById',
    'QuoteLineItem.CreatedDate',
    'QuoteLineItem.LastModifiedById',
    'QuoteLineItem.LastModifiedDate',
    'QuoteLineItem.CreatedBy.Name',
    'QuoteLineItem.LastModifiedBy.Name'
];

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/500/f1f5f9/94a3b8?text=No+Image';
const CURRENCY_FORMAT = { style: 'currency', currency: 'USD' };
const LOCALE = 'en-IN';

export default class QuoteLineItemDetail2 extends NavigationMixin(LightningElement) {
    @api recordId;

    // Tab state
    @track activeTab = 'details';

    // Error state
    @track errorMessage = '';

    // ─── WIRE: fields = required, optionalFields = spanning/audit ─
    @wire(getRecord, {
        recordId: '$recordId',
        fields: REQUIRED_FIELDS,
        optionalFields: OPTIONAL_FIELDS
    })
    wiredRecord({ data, error }) {
        if (data) {
            this.record = data;
            this.errorMessage = '';
        } else if (error) {
            this.errorMessage = error.body?.message || JSON.stringify(error);
            console.error('getRecord error:', JSON.stringify(error));
        }
    }

    record;

    // ─── LOADING ─────────────────────────────────────────────────
    get isLoading() {
        return !this.record && !this.errorMessage;
    }

    get hasError() {
        return !!this.errorMessage;
    }

    get hasData() {
        return !!this.record;
    }

    // ─── TAB GETTERS ─────────────────────────────────────────────
    get isDetailsTab() { return this.activeTab === 'details'; }
    get isRelatedTab() { return this.activeTab === 'related'; }
    get isHistoryTab() { return this.activeTab === 'history'; }
    get isFilesTab() { return this.activeTab === 'files'; }

    get detailsTabClass() {
        return 'tab-btn' + (this.activeTab === 'details' ? ' active' : '');
    }
    get relatedTabClass() {
        return 'tab-btn' + (this.activeTab === 'related' ? ' active' : '');
    }
    get historyTabClass() {
        return 'tab-btn' + (this.activeTab === 'history' ? ' active' : '');
    }
    get filesTabClass() {
        return 'tab-btn' + (this.activeTab === 'files' ? ' active' : '');
    }

    // ─── PRODUCT GETTERS ─────────────────────────────────────────
    get productName() {
        return this._getSpan('Product2', 'Name') || 'Unknown Product';
    }

    get productDescription() {
        return this._getSpan('Product2', 'Description') || '';
    }

    get productFamily() {
        return this._getSpan('Product2', 'Family') || '';
    }

    get productCode() {
        return this._getSpan('Product2', 'ProductCode') || '';
    }

    get productImage() {
        return this._getSpan('Product2', 'DisplayUrl') || PLACEHOLDER_IMAGE;
    }

    get isProductActive() {
        const val = this._getSpan('Product2', 'IsActive');
        return val !== false;
    }

    // ─── LINE ITEM GETTERS ───────────────────────────────────────
    get lineItemNumber() {
        return this._getField('LineItemNumber') || '00000000';
    }

    get quantity() {
        return getFieldValue(this.record, FIELD_QUANTITY) || 0;
    }

    get unitPrice() {
        return getFieldValue(this.record, FIELD_UNIT_PRICE) || 0;
    }

    get subtotal() {
        return getFieldValue(this.record, FIELD_SUBTOTAL) || 0;
    }

    get totalPrice() {
        return getFieldValue(this.record, FIELD_TOTAL_PRICE) || 0;
    }

    get discount() {
        return getFieldValue(this.record, FIELD_DISCOUNT) || 0;
    }

    get hasDiscount() {
        return this.discount > 0;
    }

    get listPrice() {
        return getFieldValue(this.record, FIELD_LIST_PRICE) || 0;
    }

    get lineDescription() {
        return getFieldValue(this.record, FIELD_DESCRIPTION) || 'No description available.';
    }

    get quoteId() {
        return getFieldValue(this.record, FIELD_QUOTE_ID) || '';
    }

    get product2Id() {
        return getFieldValue(this.record, FIELD_PRODUCT2_ID) || '';
    }

    // ─── QUOTE GETTERS ──────────────────────────────────────────
    get quoteName() {
        return this._getSpan('Quote', 'Name') || 'Quote';
    }

    get quoteNumber() {
        return this._getSpan('Quote', 'QuoteNumber') || '--';
    }

    get quoteStatus() {
        return this._getSpan('Quote', 'Status') || 'Draft';
    }

    // ─── AUDIT GETTERS ──────────────────────────────────────────
    get createdByName() {
        return this._getSpan('CreatedBy', 'Name') || 'Unknown';
    }

    get lastModifiedByName() {
        return this._getSpan('LastModifiedBy', 'Name') || 'Unknown';
    }

    get createdDate() {
        const dt = this._getField('CreatedDate');
        return dt ? this._formatDateTime(dt) : '';
    }

    get lastModifiedDate() {
        const dt = this._getField('LastModifiedDate');
        return dt ? this._formatDateTime(dt) : '';
    }

    // ─── FORMATTED PRICE GETTERS ─────────────────────────────────
    get formattedTotalPrice() {
        return this._formatCurrency(this.totalPrice);
    }

    get formattedUnitPrice() {
        return this._formatCurrency(this.unitPrice);
    }

    get formattedSubtotal() {
        return this._formatCurrency(this.subtotal);
    }

    get formattedListPrice() {
        return this._formatCurrency(this.listPrice);
    }

    get totalPriceDisplay() {
        return this._formatNum(this.totalPrice);
    }

    get discountText() {
        return `${this.discount}%`;
    }

    // For the Details tab — matches standard page format (e.g. "6.00%")
    get discountDisplay() {
        const d = this.discount;
        if (!d) return '';
        return `${Number(d).toFixed(2)}%`;
    }

    get quantityDisplay() {
        return Number(this.quantity).toFixed(2);
    }

    // ─── TAB ACTIONS ─────────────────────────────────────────────
    handleTabClick(event) {
        this.activeTab = event.currentTarget.dataset.tab;
    }

    // ─── NAVIGATION ACTIONS ──────────────────────────────────────
    navigateToQuote() {
        if (this.quoteId) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.quoteId,
                    objectApiName: 'Quote',
                    actionName: 'view'
                }
            });
        }
    }

    navigateToProduct() {
        if (this.product2Id) {
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: this.product2Id,
                    objectApiName: 'Product2',
                    actionName: 'view'
                }
            });
        }
    }

    handleEdit() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: 'QuoteLineItem',
                actionName: 'edit'
            }
        });
    }

    handleDelete() {
        deleteRecord(this.recordId)
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Deleted',
                    message: 'Line item has been removed.',
                    variant: 'success'
                }));
                this.navigateToQuote();
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: error.body?.message || 'Failed to delete.',
                    variant: 'error'
                }));
            });
    }

    handleDiscountQuoteEntry() {
        this.navigateToQuote();
    }

    // ─── HELPERS ─────────────────────────────────────────────────

    /**
     * Get a direct field value from the record (non-spanning).
     * e.g. _getField('LineItemNumber'), _getField('CreatedDate')
     */
    _getField(fieldName) {
        if (!this.record) return null;
        try {
            const field = this.record.fields[fieldName];
            return field ? field.value : null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Get a spanning relationship field value.
     * e.g. _getSpan('Product2', 'Name') → record.fields.Product2.value.fields.Name.value
     */
    _getSpan(relationship, fieldName) {
        if (!this.record) return null;
        try {
            const rel = this.record.fields[relationship];
            if (!rel || !rel.value || !rel.value.fields) return null;
            const field = rel.value.fields[fieldName];
            return field ? field.value : null;
        } catch (e) {
            return null;
        }
    }

    _formatCurrency(value) {
        if (value === null || value === undefined) return 'USD 0.00';
        return new Intl.NumberFormat(LOCALE, CURRENCY_FORMAT).format(value);
    }

    _formatNum(value) {
        if (value === null || value === undefined) return '0.00';
        return new Intl.NumberFormat(LOCALE, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    _formatDateTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const options = {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        return date.toLocaleString('en-US', options);
    }
}
