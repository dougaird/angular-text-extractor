import { Component, OnInit } from '@angular/core';

import { TranslateService } from '../../../../../shared/translate.service';
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {
  // Class-level strings that should NOT be extracted
  cssClass = 'profile-container';
  apiEndpoint = '/api/users';
  configPath = './config/settings.json';
  private readonly DEBUG_MODE = 'development';
  
  constructor(
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    console.log('UserProfileComponent initialized');
  }

  // Method strings that SHOULD be extracted
  showSuccess() {
    alert(this.translate.instant('app.userProfile.profile_updated_successfu_6'));
  }

  handleError() {
    throw new Error(this.translate.instant('app.userProfile.unable_to_save_profile_7'));
  }

  getWelcomeMessage() {
    return this.translate.instant('app.userProfile.welcome_to_your_profile_p_8');
  }
}