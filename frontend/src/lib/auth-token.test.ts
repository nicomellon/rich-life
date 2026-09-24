import { clearAccessToken, setAccessToken, subscribeToAccessToken } from '@/lib/auth-token'

/** A spy subscribed to token changes for the rest of the test. */
function subscribedSpy() {
  const onChange = vi.fn()
  onTestFinished(subscribeToAccessToken(onChange))
  return onChange
}

describe('subscribeToAccessToken', () => {
  it('notifies the subscriber when the token is set', () => {
    const onChange = subscribedSpy()

    setAccessToken('secret-token')

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('notifies the subscriber when the token is cleared', () => {
    const onChange = subscribedSpy()

    clearAccessToken()

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('notifies the subscriber when another tab changes the token', () => {
    const onChange = subscribedSpy()

    window.dispatchEvent(new StorageEvent('storage', { key: 'rich-life.access-token' }))

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('ignores other tabs changing other storage keys', () => {
    const onChange = subscribedSpy()

    window.dispatchEvent(new StorageEvent('storage', { key: 'some-other-key' }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('stops notifying once unsubscribed', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToAccessToken(onChange)

    unsubscribe()
    setAccessToken('secret-token')

    expect(onChange).not.toHaveBeenCalled()
  })
})
