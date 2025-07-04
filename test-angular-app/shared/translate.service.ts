import { Injectable } from '@angular/core';
import { TranslateService } from '../shared/translate.service';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class TranslateService {
  private translations: { [key: string]: string } = {};
  private currentLang = 'en';

  constructor(private http: HttpClient,
    private translate: TranslateService
  ) {}

  get(key: string): Observable<string> {
    const translation = this.translations[key];
    if (translation) {
      return of(translation);
    }
    
    // Return the key as fallback if translation not found
    return of(key);
  }

  setDefaultLang(lang: string): void {
    this.currentLang = lang;
  }

  use(lang: string): Observable<any> {
    this.currentLang = lang;
    return this.loadTranslations(lang);
  }

  private loadTranslations(lang: string): Observable<any> {
    const url = 'app.translate.assetsi18nlangjson_21' | translate;
    return this.http.get(url).pipe(
      map((translations: any) => {
        this.translations = { ...this.translations, ...translations.translations };
        return translations;
      }),
      catchError(() => {
        console.warn(`Could not load translations for ${lang}`);
        return of({});
      })
    );
  }
}
