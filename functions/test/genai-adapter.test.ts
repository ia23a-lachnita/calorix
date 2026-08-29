import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatContent } from '../src/ai-chat';
import { createGenAIAdapter } from '../src/genai-adapter';

describe('createGenAIAdapter', () => {
  const mockGenerateContent = vi.fn();
  const mockGoogleGenAI = {
    models: {
      generateContent: mockGenerateContent,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('maps ChatContent array to model generation and extracts text', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'Hello, world!' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    const contents: ChatContent[] = [
      { role: 'user', parts: [{ text: 'Hello' }] },
      { role: 'model', parts: [{ text: 'Hi there!' }] },
      { role: 'user', parts: [{ text: 'How are you?' }] },
    ];

    const result = await adapter.generateChat('gemini-2.5-flash', contents);

    expect(result).toBe('Hello, world!');
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents,
    });
  });

  it('maps JPEG inline image to model generation for vision', async () => {
    mockGenerateContent.mockResolvedValue({ text: 'I see a burger.' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    const result = await adapter.generateVision(
      'gemini-2.5-flash',
      'Analyze this food image',
      'base64imagedata',
    );

    expect(result).toBe('I see a burger.');
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Analyze this food image' },
            { inlineData: { mimeType: 'image/jpeg', data: 'base64imagedata' } },
          ],
        },
      ],
    });
  });

  it('rejects empty text response from chat model', async () => {
    mockGenerateContent.mockResolvedValue({ text: '' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateChat('gemini-2.5-flash', [
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]),
    ).rejects.toThrow('Empty model response');
  });

  it('rejects whitespace-only text response from vision model', async () => {
    mockGenerateContent.mockResolvedValue({ text: '   ' });

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateVision('gemini-2.5-flash', 'Analyze', 'base64data'),
    ).rejects.toThrow('Empty model response');
  });

  it('rejects a response with no text field', async () => {
    mockGenerateContent.mockResolvedValue({});

    const adapter = createGenAIAdapter({
      googleGenAI: mockGoogleGenAI,
      project: 'test-project',
      location: 'us-central1',
    });

    await expect(
      adapter.generateChat('gemini-2.5-flash', [
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]),
    ).rejects.toThrow('Empty model response');
  });
});
