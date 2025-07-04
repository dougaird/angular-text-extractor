import { Component } from '@angular/core';

import { TranslateService } from './shared/translate.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  // These should NOT be extracted (URIs, paths, single words, camelCase, kebab-case)
  apiUrl = 'https://api.example.com/users';
  configPath = './config/settings.json';
  cssClass = 'primary-button';
  singleWord = 'enabled';
  camelCaseId = 'userProfileData';
  interpolatedMsg = `Hello ${this.userName}, welcome!`;
  windowsPath = 'C:\\Program Files\\MyApp';
  relativePath = '../assets/images/logo.png';
  
  constructor(
    private translate: TranslateService
  ) {}
  
  // These SHOULD be extracted (user-facing messages)
  showWelcome() {
    alert(this.translate.instant('app.app.welcome_to_our_applicatio_4'));
    return this.translate.instant('app.app.please_complete_your_prof_5');
  }
  
  handleError() {
    throw new Error(this.translate.instant('app.app.unable_to_process_your_re_6'));
  }
  
  getSuccessMessage() {
    return this.translate.instant('app.app.your_changes_have_been_sa_7');
  }
}