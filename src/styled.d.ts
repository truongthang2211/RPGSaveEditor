import 'styled-components';
import lightTheme from './themes/light';

type AppTheme = typeof lightTheme;

declare module 'styled-components' {
  export interface DefaultTheme extends AppTheme {}
}
