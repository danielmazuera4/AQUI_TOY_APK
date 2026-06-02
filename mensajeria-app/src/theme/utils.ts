import { Platform, type TextStyle } from 'react-native';
import { typography } from './typography';

type TypographyVariant = 'label' | 'value' | 'title';

const baseVariantStyles: Record<TypographyVariant, TextStyle> = {
  label: typography.label,
  value: typography.value,
  title: typography.title,
};

/**
 * mergeFonts(localStyle, variant)
 *
 * Combina un estilo local con la tipografía global del sistema.
 * Úsalo para migrar pantallas viejas sin reescribir sus contenedores.
 *
 * Ejemplo:
 * <Text style={mergeFonts([styles.oldLabel, { marginBottom: 4 }], 'label')}>
 *   Origen:
 * </Text>
 * <Text style={mergeFonts(styles.oldValue, 'value')}>
 *   Calle 12 #45-67
 * </Text>
 *
 * Si el componente ya usa arrays, solo agrega la tipografía global al final:
 * <Text style={[styles.legacyText, mergeFonts(undefined, 'value')]} />
 */
export function mergeFonts(localStyle?: TextStyle | TextStyle[] | null, variant: TypographyVariant = 'value') {
  const fontStyle = baseVariantStyles[variant];

  if (!localStyle) {
    return fontStyle;
  }

  if (Array.isArray(localStyle)) {
    return [...localStyle, fontStyle];
  }

  return [localStyle, fontStyle];
}

export const paperThemeFonts = {
  displayLarge: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  displayMedium: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  displaySmall: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  headlineLarge: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  headlineMedium: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  headlineSmall: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  titleLarge: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  titleMedium: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  titleSmall: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  bodyLarge: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  labelLarge: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  labelMedium: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
  labelSmall: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
  },
};

/*
Uso recomendado con estilos viejos:

<Text style={mergeFonts([styles.legacySubtitle, { marginBottom: 2 }], 'label')}>
  Sede:
</Text>
<Text style={mergeFonts(styles.legacyValue, 'value')}>
  Calle 12 #45-67
</Text>

Para react-native-paper:

const theme = {
  ...MD3LightTheme,
  fonts: paperThemeFonts,
};

Luego pasa `theme` a `PaperProvider` para que botones, títulos y textos de Paper adopten la misma familia.
*/
