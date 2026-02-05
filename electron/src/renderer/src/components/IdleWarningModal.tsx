/**
 * Idle Warning Modal - Shows before auto-logout
 * 
 * Displays countdown and allows user to stay logged in by interacting.
 */
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface IdleWarningModalProps {
  open: boolean;
  secondsRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export function IdleWarningModal({
  open,
  secondsRemaining,
  onStayLoggedIn,
  onLogout,
}: IdleWarningModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => { }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="size-6" />
            Session About to Expire
          </DialogTitle>
          <DialogDescription>
            For security, you will be logged out due to inactivity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          <div className="text-6xl font-bold font-mono text-amber-600">
            {secondsRemaining}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            seconds remaining
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onLogout}
          >
            Log Out Now
          </Button>
          <Button
            className="flex-1"
            onClick={onStayLoggedIn}
          >
            Stay Logged In
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          This helps ensure each cashier is accountable for their own sales.
        </p>
      </DialogContent>
    </Dialog>
  );
}
