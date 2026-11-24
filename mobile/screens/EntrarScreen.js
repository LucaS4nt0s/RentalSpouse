import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  User,
  Wrench,
  Zap,
} from 'lucide-react-native';
import { useAppTheme } from '../theme/ThemeContext';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { TextInput } from '../components/ui/TextInput';
import { PasswordInput } from '../components/ui/PasswordInput';
import { Button } from '../components/ui/Button';

export const EntrarScreen = ({
  onNavigateHome,
  onNavigateClientRegister,
  onNavigateProfessionalRegister,
}) => {
  const { isDark, colors } = useAppTheme();
  const [mode, setMode] = useState('signup'); // 'signin' | 'signup'
  const [notice, setNotice] = useState(null);

  const handleSignIn = () => {
    setNotice('O login será conectado ao backend de autenticação em breve.');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Topo: voltar + alternador de tema */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={onNavigateHome}
            activeOpacity={0.7}
            style={styles.backButton}
          >
            <ArrowLeft size={16} color={colors.muted} />
            <Text style={[styles.backText, { color: colors.muted }]}>Início</Text>
          </TouchableOpacity>
          <ThemeToggle showLabel={false} />
        </View>

        {/* Marca */}
        <View style={styles.brandRow}>
          <View style={[styles.brandIcon, { backgroundColor: colors.primary }]}>
            <Zap size={20} color={colors.primaryText} />
          </View>
          <Text style={[styles.brandName, { color: colors.textPrimary }]}>
            RentalSpouse
          </Text>
        </View>

        <View style={styles.content}>
          {mode === 'signin' ? (
            <SignIn
              notice={notice}
              onToggleMode={() => {
                setMode('signup');
                setNotice(null);
              }}
              onSignIn={handleSignIn}
            />
          ) : (
            <SignUp
              onToggleMode={() => setMode('signin')}
              onNavigateClientRegister={onNavigateClientRegister}
              onNavigateProfessionalRegister={onNavigateProfessionalRegister}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

function SignIn({ notice, onToggleMode, onSignIn }) {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        Entrar na sua conta
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Bom te ver de novo. Acesse para continuar.
      </Text>

      {notice && (
        <View
          style={[
            styles.notice,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.border,
            },
          ]}
        >
          <Text style={[styles.noticeText, { color: colors.muted }]}>{notice}</Text>
        </View>
      )}

      <View style={styles.fieldGroup}>
        <FieldLabel label="E-mail" />
        <TextInput
          placeholder="voce@exemplo.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          leftIcon={<Mail size={16} color={colors.muted} />}
        />

        <FieldLabel label="Senha" action="Esqueci minha senha" />
        <PasswordInput
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
        />

        <Button variant="primary" size="lg" onPress={onSignIn}>
          Entrar
        </Button>
      </View>

      <View style={styles.switchRow}>
        <Text style={[styles.switchText, { color: colors.muted }]}>
          Ainda não tem conta?{' '}
        </Text>
        <TouchableOpacity onPress={onToggleMode} activeOpacity={0.7}>
          <Text style={[styles.switchLink, { color: colors.primary }]}>
            Cadastre-se
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SignUp({ onToggleMode, onNavigateClientRegister, onNavigateProfessionalRegister }) {
  const { colors } = useAppTheme();

  return (
    <View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>Criar conta</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Escolha o tipo de cadastro para começar.
      </Text>

      <View style={styles.fieldGroup}>
        <TypeCard
          icon={<User size={22} color={colors.primary} />}
          title="Sou Cliente"
          description="Quero contratar serviços para minha casa"
          onPress={onNavigateClientRegister}
        />
        <TypeCard
          icon={<Wrench size={22} color={colors.primary} />}
          title="Sou Profissional"
          description="Quero oferecer meus serviços e receber pedidos"
          onPress={onNavigateProfessionalRegister}
        />
      </View>

      <Text style={[styles.terms, { color: colors.muted }]}>
        Ao continuar, você concorda com os Termos de Uso e a Política de Privacidade do
        RentalSpouse.
      </Text>

      <View style={styles.switchRow}>
        <Text style={[styles.switchText, { color: colors.muted }]}>
          Já tem uma conta?{' '}
        </Text>
        <TouchableOpacity onPress={onToggleMode} activeOpacity={0.7}>
          <Text style={[styles.switchLink, { color: colors.primary }]}>Entrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function TypeCard({ icon, title, description, onPress }) {
  const { colors } = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.typeCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <View
        style={[
          styles.typeIcon,
          { backgroundColor: colors.surface2 },
        ]}
      >
        {icon}
      </View>
      <View style={styles.typeInfo}>
        <Text style={[styles.typeTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.typeDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
      <ArrowRight size={20} color={colors.muted} />
    </TouchableOpacity>
  );
}

function FieldLabel({ label, action }) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.fieldLabelRow}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      {action && (
        <Text style={[styles.fieldAction, { color: colors.primary }]}>{action}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  backText: {
    fontSize: 13,
    fontWeight: '600',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  brandIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  noticeText: {
    fontSize: 12,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldAction: {
    fontSize: 11,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    flexWrap: 'wrap',
  },
  switchText: {
    fontSize: 13,
  },
  switchLink: {
    fontSize: 13,
    fontWeight: '700',
  },
  terms: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 20,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  typeDescription: {
    fontSize: 12,
    marginTop: 2,
  },
});
