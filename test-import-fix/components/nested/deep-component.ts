import { Component } from '@angular/core';

import { TranslateService } from '../../../../../../../shared/translate.service';
@Component({
  selector: 'app-deep',
  template: '<p>Deep component</p>'
})
export class DeepComponent {

  constructor(private translate: TranslateService) {}

  showMessage() {
    alert(this.translate.instant('app.deepComponent.hello_from_deep_component_2'));
  }
}