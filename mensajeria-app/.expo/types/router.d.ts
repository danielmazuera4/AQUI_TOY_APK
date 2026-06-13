/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/inicio` | `/inicio`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/profile` | `/profile`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/servicio` | `/servicio`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/`; params?: Router.UnknownOutputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(mensajero)'}/inicio` | `/inicio`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(mensajero)'}/profile` | `/profile`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(mensajero)'}/servicio` | `/servicio`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/${`?${string}` | `#${string}` | ''}` | `/_sitemap${`?${string}` | `#${string}` | ''}` | `${'/(mensajero)'}/inicio${`?${string}` | `#${string}` | ''}` | `/inicio${`?${string}` | `#${string}` | ''}` | `${'/(mensajero)'}/profile${`?${string}` | `#${string}` | ''}` | `/profile${`?${string}` | `#${string}` | ''}` | `${'/(mensajero)'}/servicio${`?${string}` | `#${string}` | ''}` | `/servicio${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/`; params?: Router.UnknownInputParams; } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/inicio` | `/inicio`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/profile` | `/profile`; params?: Router.UnknownInputParams; } | { pathname: `${'/(mensajero)'}/servicio` | `/servicio`; params?: Router.UnknownInputParams; };
    }
  }
}
