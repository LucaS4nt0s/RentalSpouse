import React, { useState, forwardRef } from 'react';
import {
  TextInput as RNTextInput,
  View,
  StyleSheet,
} from 'react-native';
import { Colors } from '../../theme/colors';

export const TextInput = forwardRef(
  (
    {
      hasError = false,
      hasSuccess = false,
      leftIcon,
      rightIcon,
      style,
      containerStyle,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e) => {
      setIsFocused(true);
      onFocus && onFocus(e);
    };

    const handleBlur = (e) => {
      setIsFocused(false);
      onBlur && onBlur(e);
    };

    return (
      <View
        style={[
          styles.container,
          isFocused && styles.focusedContainer,
          hasError && styles.errorContainer,
          hasSuccess && styles.successContainer,
          containerStyle,
        ]}
      >
        {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}

        <RNTextInput
          ref={ref}
          placeholderTextColor={Colors.muted}
          style={[
            styles.input,
            leftIcon && styles.inputWithLeftIcon,
            rightIcon && styles.inputWithRightIcon,
            style,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />

        {rightIcon && <View style={styles.rightIconContainer}>{rightIcon}</View>}
      </View>
    );
  }
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(98, 105, 112, 0.4)',
    overflow: 'hidden',
  },
  focusedContainer: {
    borderColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  errorContainer: {
    borderColor: Colors.error,
  },
  successContainer: {
    borderColor: Colors.success,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textLight,
    fontSize: 14,
  },
  inputWithLeftIcon: {
    paddingLeft: 42,
  },
  inputWithRightIcon: {
    paddingRight: 42,
  },
  leftIconContainer: {
    position: 'absolute',
    left: 14,
    zIndex: 1,
  },
  rightIconContainer: {
    position: 'absolute',
    right: 14,
    zIndex: 1,
  },
});
