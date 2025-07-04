import { Component } from '@angular/core';

import { TranslateService } from '../shared/translate.service';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = this.translate.instant('app.app.my_angular_application_24');
  private readonly API_URL = 'https://api.example.com';
  
  constructor(
    private translate: TranslateService
  ) {
    console.log('AppComponent initialized');
  }

  showWelcomeMessage() {
    alert(this.translate.instant('app.app.welcome_to_our_applicatio_25'));
  }

  handleError() {
    throw new Error(this.translate.instant('app.app.please_check_your_interne_26'));
  }

  private logDebugInfo() {
    console.log('Debug: Component state updated');
  }
}