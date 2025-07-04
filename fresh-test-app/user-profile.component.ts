import { Component, OnInit } from '@angular/core';

import { TranslateService } from '../shared/translate.service';
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html'
})
export class UserProfileComponent implements OnInit {
  username = 'John Doe';
  private readonly CONFIG_PATH = './config/user.json';
  private readonly LOG_LEVEL = 'debug';
  
  constructor(
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    console.log('UserProfileComponent initialized');
  }

  saveProfile() {
    alert(this.translate.instant('app.userProfile.your_profile_has_been_sav_23'));
  }

  validateData() {
    if (!this.username) {
      throw new Error(this.translate.instant('app.userProfile.username_is_required_24'));
    }
  }

  private trackAnalytics() {
    console.log('Analytics: Profile viewed');
  }
}