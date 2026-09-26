import React, { useState, forwardRef } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TextInput } from './TextInput';
import { Colors } from '../../theme/colors';
import { useAppTheme } from '../../theme/ThemeContext';

export const PasswordInput = forwardRef((props, ref) => {
  const { colors } = useAppTheme();
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const eyeIcon = (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={toggleVisibility}
      style={styles.eyeBtn}
      accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
    >
      <Text style={[styles.eyeText, { color: colors.sand }]}>
        {showPassword ? '👁️' : '🙈'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <TextInput
      ref={ref}
      secureTextEntry={!showPassword}
      textContentType="newPassword"
      autoCorrect={false}
      autoCapitalize="none"
      rightIcon={eyeIcon}
      {...props}
    />
  );
});

PasswordInput.displayName = 'PasswordInput';

const styles = StyleSheet.create({
  eyeBtn: {
    padding: 6,
  },
  eyeText: {
    fontSize: 16,
    color: Colors.sand,
  },
});
