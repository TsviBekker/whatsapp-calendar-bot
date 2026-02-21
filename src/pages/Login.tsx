import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import { Calendar } from 'lucide-react';

const Login = () => {
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate('/dashboard');
    }
  }, [session, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex p-3 bg-blue-600 rounded-2xl mb-4">
            <Calendar className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900">Calendar Bot</h2>
          <p className="text-slate-600 mt-2">Your schedule, delivered to WhatsApp</p>
        </div>

        <Card className="border-none shadow-xl bg-white">
          <CardHeader className="space-y-1 text-center pb-2">
            <CardTitle className="text-xl font-bold">Welcome Back</CardTitle>
            <CardDescription>Sign in to access your dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <Auth
              supabaseClient={supabase}
              providers={['google']}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: '#2563eb',
                      brandAccent: '#1d4ed8',
                    },
                    radii: {
                      buttonRadius: '0.75rem',
                      inputRadius: '0.75rem',
                    }
                  },
                },
              }}
              theme="light"
              onlyThirdPartyProviders={true}
            />
            <p className="text-center text-xs text-slate-400 mt-6">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;