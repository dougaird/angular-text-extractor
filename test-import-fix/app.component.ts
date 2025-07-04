import { Component } from '@angular/core';

import { TranslateService } from '../../../../../shared/translate.service';
@Component({
  selector: 'app-root',
  template: '<p>Root component</p>'
})
export class AppComponent {

  constructor(private translate: TranslateService) {}

  showMessage() {
    alert(this.translate.instant('app.app.hello_from_root_1'));
  }
}