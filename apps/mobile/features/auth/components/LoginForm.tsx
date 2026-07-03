import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native'

interface LoginFormProps {
  onSubmit?: (email: string, password: string) => void
  isLoading?: boolean
}

export function LoginForm({ onSubmit, isLoading = false }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <View className="w-full max-w-sm gap-4">
      <View className="gap-1">
        <Text className="text-sm font-medium text-gray-700">Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="user@example.com"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          accessibilityLabel="Email"
        />
      </View>
      <View className="gap-1">
        <Text className="text-sm font-medium text-gray-700">Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          accessibilityLabel="Password"
        />
      </View>
      <TouchableOpacity
        onPress={() => onSubmit?.(email, password)}
        disabled={isLoading}
        className="bg-primary-600 rounded-lg py-3 items-center disabled:opacity-50"
        accessibilityRole="button"
        accessibilityLabel="로그인"
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-sm font-medium">로그인</Text>
        )}
      </TouchableOpacity>
    </View>
  )
}
