import React, { useState, forwardRef } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { TextInput } from './TextInput';
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
      {showPassword ? (
        <EyeOff size={18} color={colors.muted} />
      ) : (
        <Eye size={18} color={colors.muted} />
      )}
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
});
