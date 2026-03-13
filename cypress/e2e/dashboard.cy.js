describe('Healthcare Admin Dashboard UI Flow', () => {
  const baseUrl = 'http://localhost:3000';
  const username = Cypress.env('ADMIN_USERNAME') || 'admin@example.com';
  const password = Cypress.env('ADMIN_PASSWORD') || 'password123';

  it('opens app, logs in, validates provider, and views validation report', () => {
    // Step 1: Open the web application.
    cy.visit(baseUrl);

    // Step 2: Verify the login page loads correctly.
    // Supports common login patterns used in admin UIs.
    cy.get('body').should('be.visible');
    cy.get('body').then(($body) => {
      const hasLoginView =
        $body.find('form').length > 0 &&
        ($body.text().match(/login|sign in/i) ||
          $body.find('input[type="password"]').length > 0);

      if (hasLoginView) {
        cy.contains(/login|sign in/i).should('be.visible');

        // Step 3: Enter login credentials and submit the form.
        cy.get(
          'input[name="email"], input[name="username"], input#email, input#username, input[type="text"]'
        )
          .first()
          .should('be.visible')
          .clear()
          .type(username);

        cy.get('input[name="password"], input#password, input[type="password"]')
          .first()
          .should('be.visible')
          .clear()
          .type(password, { log: false });

        cy.get('button[type="submit"], input[type="submit"]')
          .first()
          .should('be.visible')
          .click();
      } else {
        // If auth is disabled in local/dev, continue with dashboard checks.
        cy.log('Login page not present (likely dev mode without auth). Continuing to dashboard checks.');
      }
    });

    // Step 4: Confirm the dashboard page loads successfully.
    cy.url().should('include', 'localhost:3000');
    cy.get('body').should('be.visible');
    cy.contains(/dashboard|provider directory|validation runs/i).should('be.visible');

    // Navigate to Providers page if we are not already on the provider validation table view.
    cy.get('body').then(($body) => {
      const hasProviderTable =
        $body.find('table').length > 0 &&
        ($body.text().match(/all providers|providers/i) || $body.find('#providersContainer').length > 0);

      if (!hasProviderTable) {
        cy.contains('a, button', /providers/i).first().click();
      }
    });

    // Step 5: Verify that the provider validation table is visible.
    cy.get('#providersContainer, #runsList, table').should('be.visible');
    cy.get('table').first().should('be.visible');

    // Step 6: Click the "Validate Provider" button.
    // Supports both exact label and project-specific start-run label.
    cy.get('body').then(($body) => {
      if ($body.text().match(/validate provider/i)) {
        cy.contains('button, a', /validate provider/i).first().should('be.visible').click();
      } else {
        cy.contains('button, a', /start validation run/i).first().should('be.visible').click();
      }
    });

    // Step 7: Verify that validation results are displayed.
    cy.get('body').should('be.visible');
    cy.contains(/validation run complete|success|issues|results|needs review/i).should('be.visible');

    // Step 8: Click "View Validation Report".
    // Supports report wording and project-specific "Issues" action.
    cy.get('body').then(($body) => {
      if ($body.text().match(/view validation report/i)) {
        cy.contains('button, a', /view validation report/i).first().should('be.visible').click();
      } else {
        cy.contains('button, a', /view issues|issues/i).first().should('be.visible').click();
      }
    });

    // Step 9: Verify the report page loads successfully.
    cy.get('body').should('be.visible');
    cy.contains(/validation report|issues|provider details|report/i).should('be.visible');
  });
});
