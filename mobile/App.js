import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { ThemeProvider, useAppTheme } from './theme/ThemeContext';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { ClientRegisterScreen } from './screens/ClientRegisterScreen';

const API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/api/hello'
    : 'http://localhost:8000/api/hello';

function MainApp() {
  const { isDark, colors } = useAppTheme();
  const [currentScreen, setCurrentScreen] = useState('home'); // 'home' | 'register'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHelloMessage = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error(`Erro do servidor: status ${response.status}`);
      }

      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(
        'Não foi possível conectar ao backend.\nVerifique se o container/servidor está rodando na porta 8000.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHelloMessage();
  }, []);

  if (currentScreen === 'register') {
    return <ClientRegisterScreen onNavigateBack={() => setCurrentScreen('home')} />;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <View style={styles.container}>
        {/* Card Principal em Glassmorphism */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceGlass,
              borderColor: colors.borderGlass,
            },
          ]}
        >
          {/* Barra Superior com Badge e ThemeToggle */}
          <View style={styles.topRow}>
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>RentalSpouse Mobile</Text>
            </View>
            <ThemeToggle />
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Status da API
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Conexão com FastAPI + PostgreSQL
          </Text>

          {/* Área de Conteúdo / Estados */}
          <View style={styles.contentContainer}>
            {loading && (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={colors.gold} />
                <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                  Carregando mensagem...
                </Text>
              </View>
            )}

            {!loading && error && (
              <View style={styles.centerBox}>
                <View style={styles.errorIconContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                </View>
                <Text style={styles.errorTitle}>Falha na Conexão</Text>
                <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                  {error}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.retryButton,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.borderGlassGold,
                    },
                  ]}
                  onPress={fetchHelloMessage}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.retryButtonText, { color: colors.gold }]}>
                    Tentar Novamente
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !error && data && (
              <View style={styles.centerBox}>
                <View style={styles.successIconContainer}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
                <Text style={[styles.messageText, { color: colors.textPrimary }]}>
                  {data.message}
                </Text>
                <Text style={[styles.metaText, { color: colors.muted }]}>
                  ID do Registro: #{data.id}
                </Text>
              </View>
            )}
          </View>

          {/* Ação para Abrir Tela de Cadastro de Clientes */}
          <TouchableOpacity
            style={[styles.registerButton, { backgroundColor: colors.gold }]}
            onPress={() => setCurrentScreen('register')}
            activeOpacity={0.85}
          >
            <Text style={styles.registerButtonText}>
              Ir para Cadastro de Cliente →
            </Text>
          </TouchableOpacity>

          {/* Rodapé do Card */}
          <View style={[styles.footer, { borderTopColor: colors.borderGlass }]}>
            <Text style={[styles.footerEndpoint, { color: colors.muted }]}>
              Endpoint: {API_URL}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
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
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(232, 209, 142, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(232, 209, 142, 0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#e8d18e',
    marginRight: 6,
  },
  badgeText: {
    color: '#e8d18e',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 16,
  },
  contentContainer: {
    width: '100%',
    minHeight: 160,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  successIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(232, 209, 142, 0.2)',
    borderWidth: 1,
    borderColor: '#e8d18e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 24,
    color: '#e8d18e',
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  metaText: {
    fontSize: 12,
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  errorIcon: {
    fontSize: 22,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  retryButton: {
    marginTop: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  registerButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#e8d18e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  registerButtonText: {
    color: '#11091a',
    fontSize: 14,
    fontWeight: '800',
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    width: '100%',
    alignItems: 'center',
  },
  footerEndpoint: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
