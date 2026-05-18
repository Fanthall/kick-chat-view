import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import App from '../renderer/App';
import Store from '../renderer/store/store';

beforeEach(() => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: {
      ipcRenderer: {
        once: jest.fn(),
        sendMessage: jest.fn(),
      },
      kick: {
        getAuthStatus: jest.fn().mockResolvedValue({}),
        getUsers: jest.fn().mockResolvedValue({ data: [] }),
        getChannelRewardRedemptions: jest.fn().mockResolvedValue({ data: [] }),
      },
      userWindow: {
        open: jest.fn(),
        update: jest.fn(),
        onPayload: jest.fn(),
      },
      kickConnectionWindow: {
        open: jest.fn(),
      },
    },
  });
});

describe('App', () => {
  it('should render', () => {
    expect(
      render(
        <Provider store={Store}>
          <App />
        </Provider>
      )
    ).toBeTruthy();
  });
});
