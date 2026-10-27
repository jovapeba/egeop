import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/auth_repository.dart';

final countriesListProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(authRepositoryProvider);
  return repo.fetchCountries();
});

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nicknameCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _referralCtrl = TextEditingController();
  final _sharedIpNicknameCtrl = TextEditingController();
  String? _selectedCountryId;
  bool _isLoading = false;
  bool _isSharedIp = false;

  @override
  void dispose() {
    _nicknameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _referralCtrl.dispose();
    _sharedIpNicknameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final countriesAsync = ref.watch(countriesListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Enlist New Citizen')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Center(
                    child: Container(
                      width: 84,
                      height: 84,
                      margin: const EdgeInsets.only(bottom: 20),
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.cyan.withValues(alpha: 0.3),
                            blurRadius: 20,
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
                  TacticalCard(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Citizen Registration', style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _nicknameCtrl,
                          decoration: const InputDecoration(
                            labelText: 'Citizen Nickname',
                            prefixIcon: Icon(Icons.person_outline),
                          ),
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _emailCtrl,
                          keyboardType: TextInputType.emailAddress,
                          decoration: const InputDecoration(
                            labelText: 'Email Address',
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
                        const SizedBox(height: 14),
                        // Country dropdown
                        countriesAsync.when(
                          data: (countries) {
                            if (countries.isNotEmpty && _selectedCountryId == null) {
                              _selectedCountryId = countries.first['id'] as String?;
                            }

                            return DropdownButtonFormField<String>(
                              initialValue: _selectedCountryId,
                              dropdownColor: AppColors.surfaceCard,
                              decoration: const InputDecoration(
                                labelText: 'Citizenship Country',
                                prefixIcon: Icon(Icons.flag_outlined),
                              ),
                              items: countries.map((c) {
                                return DropdownMenuItem<String>(
                                  value: c['id'] as String,
                                  child: Text('${c['name']} (${c['code']})'),
                                );
                              }).toList(),
                              onChanged: (val) {
                                setState(() => _selectedCountryId = val);
                              },
                            );
                          },
                          loading: () => const LinearProgressIndicator(color: AppColors.cyan),
                          error: (_, _) => const SizedBox.shrink(),
                        ),
                        const SizedBox(height: 14),
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text(
                            'Shared IP Registration',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                          ),
                          subtitle: const Text(
                            'Sharing connection with an existing player (max 2 accounts per IP)',
                            style: TextStyle(fontSize: 11, color: AppColors.textMuted),
                          ),
                          value: _isSharedIp,
                          activeThumbColor: AppColors.cyan,
                          onChanged: (val) => setState(() => _isSharedIp = val),
                        ),
                        const SizedBox(height: 10),
                        if (_isSharedIp) ...[
                          TextField(
                            controller: _sharedIpNicknameCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Existing Citizen Nickname on this IP',
                              prefixIcon: Icon(Icons.link, color: AppColors.cyan),
                              helperText: 'Referrals are disabled for shared IP registrations.',
                            ),
                          ),
                          const SizedBox(height: 14),
                        ] else ...[
                          TextField(
                            controller: _referralCtrl,
                            decoration: const InputDecoration(
                              labelText: 'Referral Code (Optional)',
                              prefixIcon: Icon(Icons.group_outlined),
                            ),
                          ),
                          const SizedBox(height: 14),
                        ],
                        const SizedBox(height: 10),
                        PulseButton(
                          label: 'Enlist Citizen',
                          icon: Icons.how_to_reg_rounded,
                          isLoading: _isLoading,
                          onPressed: _register,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _register() async {
    final nickname = _nicknameCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final password = _passwordCtrl.text.trim();
    final referral = _referralCtrl.text.trim();
    final sharedIpNick = _sharedIpNicknameCtrl.text.trim();
    final countryId = _selectedCountryId;

    if (nickname.isEmpty || email.isEmpty || password.isEmpty || countryId == null) {
      showErrorPopup(context, 'Please fill all required fields, including choosing a nation.');
      return;
    }

    if (_isSharedIp && sharedIpNick.isEmpty) {
      showErrorPopup(context, 'Please provide the nickname of the existing citizen on your shared IP.');
      return;
    }

    setState(() => _isLoading = true);
    final repo = ref.read(authRepositoryProvider);

    try {
      await repo.register(
        email: email,
        password: password,
        nickname: nickname,
        countryId: countryId,
        referralCode: (!_isSharedIp && referral.isNotEmpty) ? referral : null,
        sharedIpNickname: _isSharedIp ? sharedIpNick : null,
      );
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
