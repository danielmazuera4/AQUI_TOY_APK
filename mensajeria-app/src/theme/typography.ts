import { Platform } from 'react-native';

export const typography = {
  label: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-Medium',
    fontWeight: '600' as const,
    letterSpacing: 0.3,
    color: '#27272A',
  },
  value: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400' as const,
    color: '#52525B',
  },
  title: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-Bold',
    fontWeight: '700' as const,
    fontSize: 18,
  },
};
