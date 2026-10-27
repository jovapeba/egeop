import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/storage/token_storage.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/auth_repository.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl = TextEditingController(text: 'demo1@egeopolis.dev');
  final _passwordCtrl = TextEditingController(text: 'demo1234');
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    if (kDebugMode && !TokenStorage.hasExplicitlyLoggedOut) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_isLoading) {
          _login();
        }
      });
    }
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 120,
                      height: 120,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.35),
                            blurRadius: 30,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: ClipOval(
                        child: Image.asset(
                          'assets/images/logo.png',
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Center(
                    child: Text(
                      'eGEOPOLIS',
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                            fontSize: 28,
                            letterSpacing: 3,
                            fontWeight: FontWeight.w900,
                          ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Center(
                    child: Text(
                      'STRATEGY • NATIONS • POWER',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: AppColors.cyan,
                            letterSpacing: 2,
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                  ),
                  const SizedBox(height: 28),
                  TacticalCard(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Citizen Authentication', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Citizen Email',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _passwordCtrl,
                          obscureText: true,
                          decoration: const InputDecoration(
                            labelText: 'Password',
                            prefixIcon: Icon(Icons.lock_outline),
                          ),
                        ),
                        const SizedBox(height: 20),
                        PulseButton(
                          label: 'Enter World',
                          icon: Icons.login_rounded,
                          isLoading: _isLoading,
                          onPressed: _login,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('New Commander? ', style: TextStyle(color: AppColors.textSecondary)),
                      TextButton(
                        onPressed: () => context.push('/register'),
                        child: const Text('Enlist New Citizen', style: TextStyle(color: AppColors.cyan, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _login() async {
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text.trim();
    if (email.isEmpty || password.isEmpty) {
      showErrorPopup(context, 'Please enter both email and password.');
      return;
    }

    setState(() => _isLoading = true);
    final repo = ref.read(authRepositoryProvider);

    try {
      await repo.login(email, password);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      await ref.read(dailyTasksNotifierProvider.notifier).refresh();
      if (mounted) context.go('/dashboard');
    } catch (e) {
      if (mounted) {
        showErrorPopup(context, e);
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }
}
