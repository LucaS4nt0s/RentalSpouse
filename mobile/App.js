import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { Zap, ArrowRight, Wrench, ShieldCheck, Star, Clock } from 'lucide-react-native';
import { ThemeProvider, useAppTheme } from './theme/ThemeContext';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { Button } from './components/ui/Button';
import { EntrarScreen } from './screens/EntrarScreen';
import { ClientRegisterScreen } from './screens/ClientRegisterScreen';
import { ProfessionalRegisterScreen } from './screens/ProfessionalRegisterScreen';

const API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/api/hello'
    : 'http://localhost:8000/api/hello';

function HomeScreen({ onNavigateEntrar, onNavigateProfessional }) {
  const { isDark, colors } = useAppTheme();
  const [status, setStatus] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error('offline');
        setStatus(await res.json());
      } catch {
        setOffline(true);
      }
    };
    load();
  }, []);

  const features = [
    { Icon: ShieldCheck, label: 'Pagamento protegido' },
    { Icon: Clock, label: 'Orçamento rápido' },
    { Icon: Star, label: 'Avaliações reais' },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerBrand}>
            <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
              <Zap size={20} color={colors.primaryText} />
            </View>
            <Text style={[styles.logoText, { color: colors.textPrimary }]}>
              RentalSpouse
            </Text>
          </View>
          <ThemeToggle />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View
            style={[
              styles.badge,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Star size={14} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.muted }]}>
              Profissionais verificados perto de você
            </Text>
          </View>

          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Serviços residenciais, sem complicação.
          </Text>

          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Contrate eletricistas, encanadores, montadores e pintores — ou ofereça seus
            serviços. Tudo em um só lugar.
          </Text>

          <View style={styles.ctaRow}>
            <Button
              variant="primary"
              size="lg"
              onPress={onNavigateEntrar}
              style={styles.ctaPrimary}
              rightIcon={<ArrowRight size={16} color={colors.primaryText} />}
            >
              Entrar ou criar conta
            </Button>

            <Button
              variant="glass"
              size="lg"
              onPress={onNavigateProfessional}
              style={styles.ctaSecondary}
              leftIcon={<Wrench size={16} color={colors.primary} />}
            >
              Sou profissional
            </Button>
          </View>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {features.map(({ Icon, label }) => (
            <View key={label} style={styles.featureItem}>
              <Icon size={20} color={colors.primary} />
              <Text style={[styles.featureLabel, { color: colors.textSecondary }]}>
                {label}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          RentalSpouse © 2026
        </Text>
        <View style={styles.footerStatus}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: offline
                  ? colors.error
                  : status
                  ? colors.success
                  : colors.muted,
              },
            ]}
          />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            {offline ? 'Backend offline' : status ? 'API conectada' : 'Conectando...'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function MainApp() {
  const [screen, setScreen] = useState('home'); // 'home' | 'entrar' | 'clientRegister' | 'professional'
  const [professionalBack, setProfessionalBack] = useState('home');

  if (screen === 'entrar') {
    return (
      <EntrarScreen
        onNavigateHome={() => setScreen('home')}
        onNavigateClientRegister={() => setScreen('clientRegister')}
        onNavigateProfessionalRegister={() => {
          setProfessionalBack('entrar');
          setScreen('professional');
        }}
      />
    );
  }

  if (screen === 'clientRegister') {
    return <ClientRegisterScreen onNavigateBack={() => setScreen('entrar')} />;
  }

  if (screen === 'professional') {
    return <ProfessionalRegisterScreen onNavigateBack={() => setScreen(professionalBack)} />;
  }

  return (
    <HomeScreen
      onNavigateEntrar={() => setScreen('entrar')}
      onNavigateProfessional={() => {
        setProfessionalBack('home');
        setScreen('professional');
      }}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 40,
  },
  heroSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
    maxWidth: 360,
  },
  ctaRow: {
    width: '100%',
    marginTop: 32,
    gap: 12,
  },
  ctaPrimary: {
    width: '100%',
  },
  ctaSecondary: {
    width: '100%',
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    gap: 8,
  },
  featureItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  featureLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 12,
  },
  footerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
