import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html'
})
export class AppComponent {
  constructor() {}
  
  showMessage() {
    alert('This TypeScript string should NOT be extracted when using --exclude-ts');
  }
}