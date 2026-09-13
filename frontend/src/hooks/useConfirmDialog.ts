import { useState, useCallback } from 'react';

interface ConfirmOptions {
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  requireInput?: string;
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputType?: string;
  hideCancel?: boolean;
}

interface DialogState extends ConfirmOptions {
  isOpen: boolean;
  resolve: ((value: boolean | string) => void) | null;
}

export function useConfirmDialog() {
  const [state, setState] = useState<DialogState>({
    isOpen: false,
    title: '',
    message: '',
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean | string> => {
    return new Promise((resolve) => {
      setState({
        ...options,
        isOpen: true,
        resolve,
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve]);

  const handleConfirm = useCallback((inputValue?: string) => {
    if (state.showInput || state.requireInput) {
      state.resolve?.(inputValue || '');
    } else {
      state.resolve?.(true);
    }
    setState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [state.resolve, state.showInput, state.requireInput]);

  const dialogProps = {
    isOpen: state.isOpen,
    onClose: handleClose,
    onConfirm: handleConfirm,
    title: state.title,
    message: state.message,
    confirmLabel: state.confirmLabel,
    cancelLabel: state.cancelLabel,
    variant: state.variant,
    requireInput: state.requireInput,
    showInput: state.showInput,
    inputLabel: state.inputLabel,
    inputPlaceholder: state.inputPlaceholder,
    inputType: state.inputType,
    hideCancel: state.hideCancel,
  };

  return { confirm, dialogProps };
}
