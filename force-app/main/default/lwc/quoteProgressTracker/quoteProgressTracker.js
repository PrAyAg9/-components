import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, updateRecord, getFieldValue } from 'lightning/uiRecordApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import STATUS_FIELD from '@salesforce/schema/Quote.Status';
import ID_FIELD from '@salesforce/schema/Quote.Id';

// The Magic slots: Maps positive stages to their negative counterparts
const STAGE_CONFIG = [
    { default: 'Draft' },
    { default: 'Needs Review' },
    { default: 'In Review' },
    { default: 'Approved', negative: 'Rejected' },
    { default: 'Presented' },
    { default: 'Accepted', negative: 'Denied' }
];

export default class QuoteCompactPath extends LightningElement {
    @api recordId;
    @track selectedStatus = null;
    @track isUpdating = false;

    @wire(getRecord, { recordId: '$recordId', fields: [STATUS_FIELD] })
    quote;

    get dbStatus() {
        return getFieldValue(this.quote.data, STATUS_FIELD) || 'Draft';
    }

    get activeFocusStatus() {
        return this.selectedStatus ? this.selectedStatus : this.dbStatus;
    }

    // Swaps the default stage for the negative one if it's currently selected or in the DB
    get dynamicStages() {
        const currentOrFocus = this.activeFocusStatus;
        return STAGE_CONFIG.map(stage => {
            if (stage.negative && (currentOrFocus === stage.negative || this.dbStatus === stage.negative)) {
                return stage.negative;
            }
            return stage.default;
        });
    }

    get buttonLabel() {
        if (this.selectedStatus && this.selectedStatus !== this.dbStatus) {
            return 'Mark as Current Stage';
        }
        return 'Mark Status as Complete';
    }

    get progressFillStyle() {
        const stages = this.dynamicStages;
        const currentIndex = stages.indexOf(this.activeFocusStatus);
        const totalSegments = stages.length - 1;
        const percentage = totalSegments === 0 ? 0 : (currentIndex / totalSegments) * 100;
        return `width: ${percentage}%;`;
    }

    get steps() {
        const stages = this.dynamicStages;
        const dbIndex = stages.indexOf(this.dbStatus);
        const focusIndex = stages.indexOf(this.activeFocusStatus);

        return stages.map((label, index) => {
            let stepClass = 'step-wrapper';
            let nodeClass = 'node';
            let iconName = '';
            let showIcon = false;

            const isCompleted = index < dbIndex;
            const isCurrentDb = index === dbIndex;
            const isFocused = index === focusIndex;
            const isNegative = label === 'Rejected' || label === 'Denied';
            const isPositiveComplete = label === 'Approved' || label === 'Accepted';

            // 1. Logic for past steps (Blue Check)
            if (isCompleted) {
                nodeClass += ' node-completed';
                showIcon = true;
                iconName = 'utility:check';
            }
            
            // 2. Logic for current active DB step (Red Cross, Green Check, or Blue Pulse)
            if (isCurrentDb) {
                showIcon = true;
                if (isNegative) {
                    nodeClass += ' node-error';
                    iconName = 'utility:close'; // Red Cross
                } else if (isPositiveComplete) {
                    nodeClass += ' node-success';
                    iconName = 'utility:check'; // Green Tick
                } else {
                    nodeClass += ' node-current-db';
                    showIcon = false; // Just pulsing blue ring
                }
            }

            // 3. Logic for hovering/focusing
            if (isFocused && !isCurrentDb) {
                nodeClass += ' node-focused';
            }

            if (isFocused) {
                stepClass += ' text-active';
            }
            
            if (isNegative && (isCurrentDb || isFocused)) {
                stepClass += ' text-error';
            }

            return { label, key: label, stepClass, nodeClass, showIcon, iconName };
        });
    }

    handleStepClick(event) {
        this.selectedStatus = event.currentTarget.dataset.stage;
    }

    handleActionClick() {
        this.isUpdating = true;
        let targetStatus = this.selectedStatus;
        const stages = this.dynamicStages;

        if (!targetStatus || targetStatus === this.dbStatus) {
            const currentIndex = stages.indexOf(this.dbStatus);
            if (currentIndex < stages.length - 1) {
                targetStatus = stages[currentIndex + 1];
            } else {
                this.isUpdating = false;
                return; 
            }
        }

        const fields = {};
        fields[ID_FIELD.fieldApiName] = this.recordId;
        fields[STATUS_FIELD.fieldApiName] = targetStatus;

        updateRecord({ fields })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Success', message: 'Status Updated!', variant: 'success' }));
                this.selectedStatus = null;
                this.isUpdating = false;
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({ title: 'Error', message: error.body.message, variant: 'error' }));
                this.isUpdating = false;
            });
    }
}