import { Component, OnInit } from '@angular/core';

import { TranslateService } from '../shared/translate.service';
@Component({
  selector: 'app-user-profile',
  templateUrl: './user-profile.component.html'
})
export class UserProfileComponent implements OnInit {
  username = 'John Doe';
  private readonly CONFIG_PATH = './config/user.json';
  
  constructor(
    private translate: TranslateService
  ) {}

  ngOnInit(): void {
    console.log('UserProfileComponent initialized');
  }

  saveProfile() {
    // This should be extracted
    alert(this.translate.instant('app.userProfile.your_profile_has_been_sav_22'));
  }

  validateData() {
    if (!this.username) {
      // This should be extracted
      throw new Error(this.translate.instant('app.userProfile.username_is_required_23'));
    }
  }

  private trackAnalytics() {
    console.log('Analytics: Profile viewed');
  }
}