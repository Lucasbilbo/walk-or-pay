import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const { width } = Dimensions.get('window')

const SLIDES = [
  {
    title: 'Walk or Pay',
    body: 'Make a charitable commitment. Walk every day and keep your money.',
    emoji: '🚶',
  },
  {
    title: 'Commit. Walk. Get it back.',
    body: 'Deposit a refundable amount and set your daily step goal. Complete every day and your full deposit is returned to you.',
    emoji: '💰',
  },
  {
    title: 'You choose the cause',
    body: 'Pick a charity upfront. If a day goes unfulfilled, that day\'s portion is donated on your behalf. Complete the challenge and nothing is donated.',
    emoji: '🏁',
  },
]

export default function OnboardingScreen({ onDone }) {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const isLast = index === SLIDES.length - 1

  async function handleNext() {
    if (isLast) {
      await AsyncStorage.setItem('onboarding_complete', 'true')
      onDone()
    } else {
      setIndex(i => i + 1)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.slide}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleNext}>
        <Text style={styles.buttonText}>{isLast ? 'Get Started' : 'Next →'}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 56,
    paddingHorizontal: 32,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
  },
  dotActive: {
    backgroundColor: '#1a1a1a',
    width: 24,
  },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 320,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 28,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    width: width - 64,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
