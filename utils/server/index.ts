import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from 'eventsource-parser';
import { OPENAI_API_HOST } from '../app/const';
import { Humanloop } from 'humanloop';
import { Configuration, OpenAIApi } from 'openai';

export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  key: string,
  messages: Message[],
) => {
  const res = await fetch(`${OPENAI_API_HOST}/v1/chat/completions`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key ? key : process.env.OPENAI_API_KEY}`,
    },
    method: 'POST',
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...messages,
      ],
      max_tokens: 1000,
      temperature: 1,
      stream: true,
    }),
  });

  // const config = new Configuration({
  //   apiKey: key ? key : process.env.OPENAI_API_KEY,
  // });

  // const oai = new OpenAIApi(config);
  // const oaiResponse = await oai.createCompletion({
  //   model: 'text-davinci-003',
  //   prompt:
  //     `System: ${systemPrompt}\n` +
  //     messages.map((m) => `${m.role}: ${m.content}`).join('\n'),
  //   max_tokens: 1000,
  //   temperature: 1,
  //   // stream: true,
  // });
  // console.log(oaiResponse);

  // Using this here in edge runtime ends with a [TypeError: adapter is not a function]
  const hl = new Humanloop({
    apiKey: process.env.HUMANLOOP_API_KEY,
    // Would like this
    // openaiApiKey: process.env.OPENAI_API_KEY,
    // anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  const hlResponse = await hl.chat({
    project: 'ts-sdk-test',
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
    model_config: {
      model: model.id,
      max_tokens: 1000,
      temperature: 1,
    },
    // This would now be optional override of the other keys
    provider_api_keys: {
      openai: key ? key : process.env.OPENAI_API_KEY,
    },
  });
  console.log(hlResponse);

  if (res.status !== 200) {
    const statusText = res.statusText;
    throw new Error(`OpenAI API returned an error: ${statusText}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data;

          if (data === '[DONE]') {
            controller.close();
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = json.choices[0].delta.content;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(e);
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
};
