/**
 * QuoteActionService — Lightweight Apex controller for Quote LWC components.
 * Handles operations that CANNOT be done purely client-side in LWC:
 *   - Product Search (SOQL on PricebookEntry)
 *   - Add Products to Quote (DML insert QuoteLineItem)
 *   - Reprice Quote (triggers admin-configured pricing flows/rules)
 *   - Submit for Approval (Approval.ProcessSubmitRequest)
 *   - Bulk Delete (DML delete multiple records)
 */
public with sharing class QuoteActionService {

    // ─── PRODUCT SEARCH ───────────────────────────────────────────
    // Searches products available in the Quote's Pricebook
    @AuraEnabled(cacheable=true)
    public static List<ProductSearchResult> searchProducts(String searchTerm, Id quoteId) {
        // Get the Quote's pricebook (fallback to Standard Pricebook)
        Quote q = [SELECT Pricebook2Id FROM Quote WHERE Id = :quoteId LIMIT 1];
        Id pricebookId = q.Pricebook2Id;
        if (pricebookId == null) {
            Pricebook2 stdPb = [SELECT Id FROM Pricebook2 WHERE IsStandard = true LIMIT 1];
            pricebookId = stdPb.Id;
        }

        String searchKey = '%' + String.escapeSingleQuotes(searchTerm) + '%';

        List<PricebookEntry> entries = [
            SELECT Id, Product2Id, Product2.Name, Product2.Family, 
                   Product2.Description, Product2.DisplayUrl, UnitPrice
            FROM PricebookEntry
            WHERE Pricebook2Id = :pricebookId
              AND IsActive = true
              AND Product2.IsActive = true
              AND Product2.Name LIKE :searchKey
            ORDER BY Product2.Name
            LIMIT 50
        ];

        List<ProductSearchResult> results = new List<ProductSearchResult>();
        for (PricebookEntry pbe : entries) {
            ProductSearchResult r = new ProductSearchResult();
            r.pricebookEntryId = pbe.Id;
            r.productId = pbe.Product2Id;
            r.name = pbe.Product2.Name;
            r.family = pbe.Product2.Family;
            r.description = pbe.Product2.Description;
            r.imageUrl = pbe.Product2.DisplayUrl;
            r.unitPrice = pbe.UnitPrice;
            results.add(r);
        }
        return results;
    }

    // Wrapper class for product search results
    public class ProductSearchResult {
        @AuraEnabled public Id pricebookEntryId;
        @AuraEnabled public Id productId;
        @AuraEnabled public String name;
        @AuraEnabled public String family;
        @AuraEnabled public String description;
        @AuraEnabled public String imageUrl;
        @AuraEnabled public Decimal unitPrice;
    }

    // ─── ADD PRODUCTS TO QUOTE ────────────────────────────────────
    // Creates QuoteLineItem records for selected products
    @AuraEnabled
    public static List<Id> addProductsToQuote(Id quoteId, List<Id> pricebookEntryIds) {
        List<PricebookEntry> entries = [
            SELECT Id, UnitPrice, Product2Id 
            FROM PricebookEntry 
            WHERE Id IN :pricebookEntryIds
        ];

        List<QuoteLineItem> newItems = new List<QuoteLineItem>();
        for (PricebookEntry pbe : entries) {
            newItems.add(new QuoteLineItem(
                QuoteId = quoteId,
                PricebookEntryId = pbe.Id,
                Product2Id = pbe.Product2Id,
                Quantity = 1,
                UnitPrice = pbe.UnitPrice
            ));
        }
        insert newItems;

        List<Id> insertedIds = new List<Id>();
        for (QuoteLineItem item : newItems) {
            insertedIds.add(item.Id);
        }
        return insertedIds;
    }

    // ─── REPRICE QUOTE ────────────────────────────────────────────
    // Triggers reprice by updating line items (fires admin-configured
    // pricing rules, flows, and Revenue Cloud pricing engine)
    @AuraEnabled
    public static String repriceQuote(Id quoteId) {
        try {
            List<QuoteLineItem> items = [
                SELECT Id, Quantity, UnitPrice, Discount 
                FROM QuoteLineItem 
                WHERE QuoteId = :quoteId
            ];

            if (items.isEmpty()) {
                return 'No line items to reprice.';
            }

            // Update triggers admin pricing flows/rules
            update items;

            // Also touch the Quote to refresh GrandTotal / TotalPrice
            Quote q = [SELECT Id FROM Quote WHERE Id = :quoteId LIMIT 1];
            update q;

            return 'Success';
        } catch (Exception e) {
            throw new AuraHandledException('Reprice failed: ' + e.getMessage());
        }
    }

    // ─── SUBMIT FOR APPROVAL ──────────────────────────────────────
    @AuraEnabled
    public static String submitForApproval(Id quoteId) {
        try {
            Approval.ProcessSubmitRequest req = new Approval.ProcessSubmitRequest();
            req.setObjectId(quoteId);
            req.setComments('Submitted from custom Quote component.');
            
            Approval.ProcessResult result = Approval.process(req);
            
            if (result.isSuccess()) {
                return 'Success';
            } else {
                return 'Failed: ' + result.getErrors()[0].getMessage();
            }
        } catch (Exception e) {
            throw new AuraHandledException('Approval submission failed: ' + e.getMessage());
        }
    }

    // ─── BULK DELETE LINE ITEMS ───────────────────────────────────
    @AuraEnabled
    public static void bulkDeleteLineItems(List<Id> lineItemIds) {
        try {
            List<QuoteLineItem> toDelete = [
                SELECT Id FROM QuoteLineItem WHERE Id IN :lineItemIds
            ];
            delete toDelete;
        } catch (Exception e) {
            throw new AuraHandledException('Bulk delete failed: ' + e.getMessage());
        }
    }

    // ─── GET PRODUCT FAMILIES (for filter sidebar) ────────────────
    @AuraEnabled(cacheable=true)
    public static List<String> getProductFamilies() {
        Set<String> families = new Set<String>();
        for (Product2 p : [SELECT Family FROM Product2 WHERE IsActive = true AND Family != null]) {
            families.add(p.Family);
        }
        List<String> result = new List<String>(families);
        result.sort();
        return result;
    }

    // ─── UPDATE LINE ITEMS (batch quantity/discount changes) ──────
    @AuraEnabled
    public static void updateLineItems(String lineItemsJson) {
        try {
            List<Map<String, Object>> items = 
                (List<Map<String, Object>>) JSON.deserializeUntyped(lineItemsJson);
            
            List<QuoteLineItem> toUpdate = new List<QuoteLineItem>();
            for (Map<String, Object> item : items) {
                QuoteLineItem qli = new QuoteLineItem();
                qli.Id = (Id) item.get('Id');
                if (item.containsKey('Quantity')) {
                    qli.Quantity = Decimal.valueOf(String.valueOf(item.get('Quantity')));
                }
                if (item.containsKey('Discount')) {
                    qli.Discount = Decimal.valueOf(String.valueOf(item.get('Discount')));
                }
                toUpdate.add(qli);
            }
            update toUpdate;
        } catch (Exception e) {
            throw new AuraHandledException('Update failed: ' + e.getMessage());
        }
    }
}
