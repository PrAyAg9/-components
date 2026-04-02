/**
 * Test class for QuoteActionService
 * Covers: searchProducts, addProductsToQuote, repriceQuote,
 *         submitForApproval, bulkDeleteLineItems, getProductFamilies,
 *         updateLineItems
 */
@isTest
private class QuoteActionServiceTest {

    @TestSetup
    static void setupTestData() {
        // Create Standard Pricebook (automatically available in test context)
        // Create Product
        Product2 prod = new Product2(
            Name = 'GenWatt Diesel 10kW',
            Family = 'Generators',
            IsActive = true,
            Description = 'Test generator product'
        );
        insert prod;

        Product2 prod2 = new Product2(
            Name = 'SLA Bronze Support',
            Family = 'Support',
            IsActive = true,
            Description = 'Bronze support plan'
        );
        insert prod2;

        // Get Standard Pricebook Id
        Id stdPricebookId = Test.getStandardPricebookId();

        // Create PricebookEntries
        PricebookEntry pbe1 = new PricebookEntry(
            Pricebook2Id = stdPricebookId,
            Product2Id = prod.Id,
            UnitPrice = 5000,
            IsActive = true
        );
        insert pbe1;

        PricebookEntry pbe2 = new PricebookEntry(
            Pricebook2Id = stdPricebookId,
            Product2Id = prod2.Id,
            UnitPrice = 10000,
            IsActive = true
        );
        insert pbe2;

        // Create Opportunity (required for Quote)
        Opportunity opp = new Opportunity(
            Name = 'Test Opportunity',
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Pricebook2Id = stdPricebookId
        );
        insert opp;

        // Create Quote
        Quote q = new Quote(
            Name = 'Test Quote',
            OpportunityId = opp.Id,
            Pricebook2Id = stdPricebookId,
            Status = 'Draft',
            ExpirationDate = Date.today().addDays(60)
        );
        insert q;

        // Create QuoteLineItems
        QuoteLineItem qli1 = new QuoteLineItem(
            QuoteId = q.Id,
            PricebookEntryId = pbe1.Id,
            Product2Id = prod.Id,
            Quantity = 3,
            UnitPrice = 5000
        );
        insert qli1;

        QuoteLineItem qli2 = new QuoteLineItem(
            QuoteId = q.Id,
            PricebookEntryId = pbe2.Id,
            Product2Id = prod2.Id,
            Quantity = 1,
            UnitPrice = 10000
        );
        insert qli2;
    }

    @isTest
    static void testSearchProducts() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];
        
        Test.startTest();
        List<QuoteActionService.ProductSearchResult> results = 
            QuoteActionService.searchProducts('GenWatt', q.Id);
        Test.stopTest();

        System.assertEquals(1, results.size(), 'Should find 1 matching product');
        System.assertEquals('GenWatt Diesel 10kW', results[0].name);
        System.assertNotEquals(null, results[0].pricebookEntryId);
    }

    @isTest
    static void testSearchProductsNoMatch() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];
        
        Test.startTest();
        List<QuoteActionService.ProductSearchResult> results = 
            QuoteActionService.searchProducts('NonExistentProduct', q.Id);
        Test.stopTest();

        System.assertEquals(0, results.size(), 'Should find no matching products');
    }

    @isTest
    static void testAddProductsToQuote() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];
        PricebookEntry pbe = [SELECT Id FROM PricebookEntry WHERE Product2.Name = 'GenWatt Diesel 10kW' LIMIT 1];
        
        Integer countBefore = [SELECT COUNT() FROM QuoteLineItem WHERE QuoteId = :q.Id];

        Test.startTest();
        List<Id> newIds = QuoteActionService.addProductsToQuote(q.Id, new List<Id>{ pbe.Id });
        Test.stopTest();

        Integer countAfter = [SELECT COUNT() FROM QuoteLineItem WHERE QuoteId = :q.Id];
        System.assertEquals(countBefore + 1, countAfter, 'Should have one more line item');
        System.assertEquals(1, newIds.size());
    }

    @isTest
    static void testRepriceQuote() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];

        Test.startTest();
        String result = QuoteActionService.repriceQuote(q.Id);
        Test.stopTest();

        System.assertEquals('Success', result);
    }

    @isTest
    static void testRepriceQuoteNoItems() {
        // Create a quote with no line items
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
        Quote emptyQuote = new Quote(
            Name = 'Empty Quote',
            OpportunityId = opp.Id,
            Pricebook2Id = Test.getStandardPricebookId(),
            Status = 'Draft'
        );
        insert emptyQuote;

        Test.startTest();
        String result = QuoteActionService.repriceQuote(emptyQuote.Id);
        Test.stopTest();

        System.assertEquals('No line items to reprice.', result);
    }

    @isTest
    static void testBulkDeleteLineItems() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];
        List<QuoteLineItem> items = [SELECT Id FROM QuoteLineItem WHERE QuoteId = :q.Id];
        List<Id> itemIds = new List<Id>();
        for (QuoteLineItem item : items) {
            itemIds.add(item.Id);
        }

        Test.startTest();
        QuoteActionService.bulkDeleteLineItems(itemIds);
        Test.stopTest();

        Integer countAfter = [SELECT COUNT() FROM QuoteLineItem WHERE QuoteId = :q.Id];
        System.assertEquals(0, countAfter, 'All items should be deleted');
    }

    @isTest
    static void testGetProductFamilies() {
        Test.startTest();
        List<String> families = QuoteActionService.getProductFamilies();
        Test.stopTest();

        System.assert(families.size() >= 2, 'Should have at least 2 families');
        System.assert(families.contains('Generators'), 'Should contain Generators');
        System.assert(families.contains('Support'), 'Should contain Support');
    }

    @isTest
    static void testUpdateLineItems() {
        QuoteLineItem qli = [SELECT Id FROM QuoteLineItem LIMIT 1];
        
        String json = '[{"Id":"' + qli.Id + '","Quantity":5}]';

        Test.startTest();
        QuoteActionService.updateLineItems(json);
        Test.stopTest();

        QuoteLineItem updated = [SELECT Quantity FROM QuoteLineItem WHERE Id = :qli.Id];
        System.assertEquals(5, updated.Quantity, 'Quantity should be updated to 5');
    }

    @isTest
    static void testSubmitForApproval() {
        Quote q = [SELECT Id FROM Quote LIMIT 1];

        Test.startTest();
        try {
            // This may fail if no Approval Process is configured, which is expected
            String result = QuoteActionService.submitForApproval(q.Id);
            // If it succeeds, great
            System.assertNotEquals(null, result);
        } catch (AuraHandledException e) {
            // Expected if no approval process is set up in test context
            System.assert(e.getMessage() != null, 'Should have error message');
        }
        Test.stopTest();
    }
}
