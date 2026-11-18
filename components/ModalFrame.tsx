import React from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

// Match the app frame breakpoint and width. Native and narrow web screens
// retain their full width; the modal surface is centered on wider web screens.
export const APP_FRAME_BREAKPOINT = 540;
export const APP_FRAME_MAX_WIDTH = 480;

export const ModalFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { width } = useWindowDimensions();
  const wideWeb = Platform.OS === 'web' && width > APP_FRAME_BREAKPOINT;
  return (
    <View style={{ flex: 1, width: '100%', alignSelf: 'center', overflow: 'hidden', ...(wideWeb ? { maxWidth: APP_FRAME_MAX_WIDTH } : {}) }}>
      {children}
    </View>
  );
};
