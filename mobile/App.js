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

/**
 * Define a URL base dinamicamente com base na plataforma:
 * - Android Emulator: 10.0.2.2 mapeia para o localhost do host
 * - iOS Simulator / Web: localhost funciona diretamente
 * - Dispositivo Físico (Expo Go): substitua pelo IP da máquina na rede local (ex: 192.168.1.X)
 */
const API_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000/api/hello'
    : 'http://localhost:8000/api/hello';

export default function App() {
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      <View style={styles.container}>
        {/* Card Principal */}
        <View style={styles.card}>
          {/* Badge RentalSpouse */}
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>RentalSpouse Mobile</Text>
          </View>

          <Text style={styles.title}>Status da API</Text>
          <Text style={styles.subtitle}>Conexão com FastAPI + PostgreSQL</Text>

          {/* Área de Conteúdo / Estados */}
          <View style={styles.contentContainer}>
            {loading && (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={styles.loadingText}>Carregando mensagem...</Text>
              </View>
            )}

            {!loading && error && (
              <View style={styles.centerBox}>
                <View style={styles.errorIconContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                </View>
                <Text style={styles.errorTitle}>Falha na Conexão</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={fetchHelloMessage}
                  activeOpacity={0.8}
                >
                  <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                </TouchableOpacity>
              </View>
            )}

            {!loading && !error && data && (
              <View style={styles.centerBox}>
                <View style={styles.successIconContainer}>
                  <Text style={styles.successIcon}>✓</Text>
                </View>
                <Text style={styles.messageText}>{data.message}</Text>
                <Text style={styles.metaText}>ID do Registro: #{data.id}</Text>
              </View>
            )}
          </View>

          {/* Rodapé do Card */}
          <View style={styles.footer}>
            <Text style={styles.footerEndpoint}>Endpoint: {API_URL}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f1f5f9',
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
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  badgeText: {
    color: '#047857',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    marginBottom: 20,
  },
  contentContainer: {
    width: '100%',
    minHeight: 180,
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
    color: '#64748b',
    fontWeight: '500',
  },
  successIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  successIcon: {
    fontSize: 24,
    color: '#4f46e5',
    fontWeight: 'bold',
  },
  messageText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    lineHeight: 26,
  },
  metaText: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fef2f2',
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
    color: '#b91c1c',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: '#7f1d1d',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    width: '100%',
    alignItems: 'center',
  },
  footerEndpoint: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
