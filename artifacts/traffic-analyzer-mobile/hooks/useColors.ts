import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

// The app uses a fixed dark theme regardless of system preference
// (matching the web app which is always dark)
export function useColors() {
  return colors.dark;
}
