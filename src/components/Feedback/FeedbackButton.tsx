import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { FeedbackSheet } from './FeedbackSheet';

interface FeedbackButtonProps {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm';
  className?: string;
}

export const FeedbackButton: React.FC<FeedbackButtonProps> = ({ 
  variant = 'outline',
  size = 'default',
  className 
}) => {
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setShowFeedback(true)}
        className={className}
      >
        <MessageSquare className="w-4 h-4 mr-2" />
        Feedback geben
      </Button>
      
      <FeedbackSheet 
        open={showFeedback} 
        onOpenChange={setShowFeedback} 
      />
    </>
  );
};

export default FeedbackButton;
