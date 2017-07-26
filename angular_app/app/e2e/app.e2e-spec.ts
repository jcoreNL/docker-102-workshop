import { AngularAppPage } from './app.po';

describe('angular-app App', () => {
  let page: AngularAppPage;

  beforeEach(() => {
    page = new AngularAppPage();
  });

  it('should display welcome message', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('Welcome to app!!');
  });
});
