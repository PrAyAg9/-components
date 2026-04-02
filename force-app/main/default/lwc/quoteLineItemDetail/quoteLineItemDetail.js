import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue, deleteRecord } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

// ─── QuoteLineItem Fields ─────────────────────────────────────
const QLI_FIELDS = [
    'QuoteLineItem.Quantity',
    'QuoteLineItem.UnitPrice',
    'QuoteLineItem.Subtotal',
    'QuoteLineItem.TotalPrice',
    'QuoteLineItem.Discount',
    'QuoteLineItem.Description',
    'QuoteLineItem.ListPrice',
    'QuoteLineItem.ServiceDate',
    'QuoteLineItem.SortOrder',
    'QuoteLineItem.QuoteId',
    'QuoteLineItem.Product2Id',
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
    'QuoteLineItem.Quote.Status'
];

// Fields for the inline editable record form at bottom
// NOTE: lightning-record-form needs plain field API names (not 'Object.Field' format)
// because object-api-name is already set on the component
const EDITABLE_FIELDS = [
    'Quantity',
    'UnitPrice',
    'Discount',
    'Description',
    'ServiceDate'
];

const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/500/f1f5f9/94a3b8?text=No+Image';
const CURRENCY_FORMAT = { style: 'currency', currency: 'INR' };
const LOCALE = 'en-IN';

export default class QuoteLineItemDetail extends NavigationMixin(LightningElement) {
    @api recordId;

    // ─── WIRE: Fetch all QuoteLineItem + Product2 + Quote data ────
    @wire(getRecord, { recordId: '$recordId', fields: QLI_FIELDS })
    wiredRecord;

    // ─── LOADING ──────────────────────────────────────────────────
    get isLoading() {
        return !this.wiredRecord || (!this.wiredRecord.data && !this.wiredRecord.error);
    }

    // ─── PRODUCT GETTERS ──────────────────────────────────────────
    get productName() {
        return this._getVal('Product2.Name') || 'Unknown Product';
    }

    get productDescription() {
        return this._getVal('Product2.Description') || '';
    }

    get productFamily() {
        return this._getVal('Product2.Family') || '';
    }

    get productCode() {
        return this._getVal('Product2.ProductCode') || '';
    }

    get productImage() {
        return this._getVal('Product2.DisplayUrl') || PLACEHOLDER_IMAGE;
    }

    get isProductActive() {
        const val = this._getVal('Product2.IsActive');
        return val !== false;
    }

    get unitOfMeasure() {
        return this._getVal('Product2.QuantityUnitOfMeasure') || 'units';
    }

    // ─── LINE ITEM GETTERS ────────────────────────────────────────
    get quantity() {
        return this._getVal('Quantity') || 0;
    }

    get unitPrice() {
        return this._getVal('UnitPrice') || 0;
    }

    get subtotal() {
        return this._getVal('Subtotal') || 0;
    }

    get totalPrice() {
        return this._getVal('TotalPrice') || 0;
    }

    get discount() {
        return this._getVal('Discount') || 0;
    }

    get hasDiscount() {
        return this.discount > 0;
    }

    get listPrice() {
        return this._getVal('ListPrice') || 0;
    }

    get serviceDate() {
        return this._getVal('ServiceDate') || '';
    }

    get lineDescription() {
        return this._getVal('Description') || '';
    }

    get quoteId() {
        return this._getVal('QuoteId') || '';
    }

    // ─── QUOTE GETTERS ────────────────────────────────────────────
    get quoteName() {
        return this._getVal('Quote.Name') || 'Quote';
    }

    get quoteNumber() {
        return this._getVal('Quote.QuoteNumber') || '--';
    }

    get quoteStatus() {
        return this._getVal('Quote.Status') || 'Draft';
    }

    // ─── FORMATTED PRICE GETTERS ──────────────────────────────────
    get totalPriceFormatted() {
        return this._formatNum(this.totalPrice);
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

    get formattedSavings() {
        const savings = this.subtotal - this.totalPrice;
        return this._formatCurrency(savings > 0 ? savings : 0);
    }

    get discountText() {
        return `${this.discount}%`;
    }

    // ─── SPECIFICATIONS TABLE ─────────────────────────────────────
    get specifications() {
        const specs = [];
        const addSpec = (label, value) => {
            if (value !== null && value !== undefined && value !== '') {
                specs.push({
                    key: label,
                    label,
                    value: String(value),
                    rowClass: specs.length % 2 === 0 ? 'spec-row spec-row-alt' : 'spec-row'
                });
            }
        };

        addSpec('Product Name', this.productName);
        addSpec('Product Code', this.productCode);
        addSpec('Product Family', this.productFamily);
        addSpec('Unit of Measure', this.unitOfMeasure);
        addSpec('Unit Price', this.formattedUnitPrice);
        addSpec('List Price', this.listPrice ? this.formattedListPrice : null);
        addSpec('Quantity', this.quantity);
        addSpec('Discount', this.hasDiscount ? `${this.discount}%` : 'None');
        addSpec('Subtotal', this.formattedSubtotal);
        addSpec('Total Price', this._formatCurrency(this.totalPrice));
        addSpec('Service Date', this.serviceDate || 'Not set');
        addSpec('Active', this.isProductActive ? 'Yes' : 'No');
        addSpec('Quote', `${this.quoteName} (#${this.quoteNumber})`);

        return specs;
    }

    // ─── EDITABLE FIELDS for lightning-record-form ────────────────
    get editableFields() {
        return EDITABLE_FIELDS;
    }

    // ─── NAVIGATION ACTIONS ───────────────────────────────────────
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

    handleClone() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                objectApiName: 'QuoteLineItem',
                actionName: 'clone'
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

    // ─── HELPERS ──────────────────────────────────────────────────
    _getVal(field) {
        if (!this.wiredRecord || !this.wiredRecord.data) return null;
        // Handle spanning fields (e.g., "Product2.Name")
        const parts = field.split('.');
        let obj = this.wiredRecord.data.fields;
        for (let i = 0; i < parts.length; i++) {
            if (!obj || !obj[parts[i]]) return null;
            if (i < parts.length - 1) {
                obj = obj[parts[i]].value?.fields;
            } else {
                return obj[parts[i]].value;
            }
        }
        return null;
    }

    _formatCurrency(value) {
        if (value === null || value === undefined) return '₹0.00';
        return new Intl.NumberFormat(LOCALE, CURRENCY_FORMAT).format(value);
    }

    // Format number without currency symbol (for the big display)
    _formatNum(value) {
        if (value === null || value === undefined) return '0.00';
        return new Intl.NumberFormat(LOCALE, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        }).format(value);
    }
}
