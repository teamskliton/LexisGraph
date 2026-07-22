import React from 'react';
import Button from './Button';
import Card from './Card';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err) {
    console.error('Page error', err);
  }

  componentDidUpdate(prevProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="mx-auto max-w-xl p-8 text-center">
          <h2 className="text-2xl font-semibold">Something went wrong on this page</h2>
          <p className="mt-2 text-textSecondary">Please retry. If this persists, verify backend connectivity.</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </Card>
      );
    }

    return this.props.children;
  }
}
