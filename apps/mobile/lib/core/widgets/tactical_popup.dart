import 'dart:convert';
import 'dart:ui';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../theme/app_colors.dart';

enum PopupType {
  error,
  warning,
  success,
  info,
}

String cleanErrorMessage(dynamic error) {
  if (error == null) return 'An unexpected operational event occurred.';

  // Handle DioException directly
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return 'Tactical uplink timed out. Please check your network and retry.';
    }
    if (error.type == DioExceptionType.connectionError) {
      return 'Tactical uplink offline. Verify internet connection.';
    }
    if (error.type == DioExceptionType.cancel) {
      return 'Tactical directive was cancelled.';
    }

    final statusCode = error.response?.statusCode;
    if (statusCode != null && statusCode >= 500) {
      return 'Tactical headquarters servers are temporarily experiencing high load. Please try again shortly.';
    }

    final data = error.response?.data;
    if (data is Map) {
      final msg = data['message'] ?? data['error'];
      if (msg is List) {
        final joined = msg.map((e) => e.toString().trim()).where((e) => e.isNotEmpty).join('\n• ');
        return joined.isNotEmpty ? (msg.length > 1 ? '• $joined' : joined) : 'Validation failed. Check inputs.';
      } else if (msg is String && msg.trim().isNotEmpty) {
        return _sanitizeAndMapErrorText(msg, statusCode);
      }
    } else if (data is String && data.trim().isNotEmpty && !data.trim().startsWith('<')) {
      return _sanitizeAndMapErrorText(data, statusCode);
    }

    if (statusCode == 401) return 'Operational session expired. Please log in again to continue.';
    if (statusCode == 403) return 'Clearance denied: You do not have permission for this tactical action.';
    if (statusCode == 404) return 'Requested tactical resource or citizen record was not found.';
    if (statusCode == 409) return 'Conflict detected: This tactical action cannot be performed in the current state.';
  }

  String msg = error.toString().trim();

  // Strip exception/error prefixes iteratively
  bool stripped = true;
  while (stripped) {
    stripped = false;
    for (final prefix in [
      'Exception: ',
      'Error: ',
      'FormatException: ',
      'ClientException: ',
      'DioException: ',
    ]) {
      if (msg.startsWith(prefix)) {
        msg = msg.substring(prefix.length).trim();
        stripped = true;
      }
    }
    // Handle DioException [bad response]: etc.
    final dioRegex = RegExp(r'^DioException\s*\[[^\]]+\]:\s*');
    final match = dioRegex.firstMatch(msg);
    if (match != null) {
      msg = msg.substring(match.end).trim();
      stripped = true;
    }
  }

  // Handle JSON error strings
  if (msg.startsWith('{') && msg.endsWith('}')) {
    try {
      final decoded = jsonDecode(msg);
      if (decoded is Map) {
        final inner = decoded['message'] ?? decoded['error'];
        if (inner is List) {
          msg = inner.join('\n• ');
        } else if (inner is String) {
          msg = inner;
        }
      }
    } catch (_) {}
  }

  return _sanitizeAndMapErrorText(msg, null);
}

String _sanitizeAndMapErrorText(String raw, int? statusCode) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) {
    return 'An unexpected operational event occurred.';
  }

  final lower = trimmed.toLowerCase();

  // Guard against any leaked stack traces, Prisma, SQL, internal server errors
  if (lower.contains('prisma') ||
      lower.contains('prismaclient') ||
      lower.contains('postgresql') ||
      lower.contains('postgres') ||
      lower.contains('syntax error') ||
      lower.contains('column does not exist') ||
      lower.contains('relation does not exist') ||
      lower.contains('at object.') ||
      lower.contains('at process') ||
      lower.contains('null check operator') ||
      lower.contains('nosuchmethoderror') ||
      lower.contains('lateinitializationerror') ||
      lower.contains('rangeerror') ||
      lower.contains('internal server error') ||
      lower.contains('typeerror:') ||
      (statusCode != null && statusCode >= 500)) {
    if (lower.contains('unique') || lower.contains('duplicate')) {
      return 'This tactical action has already been completed or the record exists.';
    }
    if (lower.contains('foreign key') || lower.contains('does not exist')) {
      return 'The referenced tactical asset or record could not be found.';
    }
    if (lower.contains('econnrefused') || lower.contains('socketexception')) {
      return 'Tactical uplink offline. Verify internet connection.';
    }
    return 'Tactical headquarters servers are temporarily experiencing high load. Please try again shortly.';
  }

  // Network & Socket errors
  if (lower.contains('econnrefused') ||
      lower.contains('socketexception') ||
      lower.contains('connection refused') ||
      lower.contains('network is unreachable')) {
    return 'Tactical uplink offline. Verify internet connection.';
  }

  // Domain phrase mapping
  if (lower.contains('already subscribed')) {
    return 'You are already subscribed to this publication.';
  }
  if (lower.contains('already upvoted')) {
    return 'You have already upvoted this intelligence dispatch.';
  }
  if (lower.contains('portal name too short')) {
    return 'Publication name must be at least 3 characters.';
  }
  if (lower.contains('create a news portal first')) {
    return 'Found a news agency first before publishing articles.';
  }
  if (lower.contains('5 articles per day limit')) {
    return 'Daily publication limit reached (max 5 articles per day).';
  }
  if (lower.contains('title and body required')) {
    return 'Please provide both a headline and article content.';
  }
  if (lower.contains('cannot tip yourself')) {
    return 'You cannot transfer tips to your own publication.';
  }
  if (lower.contains('tip must be between')) {
    return 'Tip amount must be between 0.01 and 500 Gold.';
  }
  if (lower.contains('empty shout')) {
    return 'Transmission content cannot be empty.';
  }
  if (lower.contains('join an army first')) {
    return 'You must enlist in a military unit first.';
  }
  if (lower.contains('leave your current army first') || lower.contains('leave current army')) {
    return 'You must resign from your current military unit first.';
  }
  if (lower.contains('3-day cooldown between armies') || lower.contains('cooldown between armies')) {
    return 'Military transfer cooldown active: 3 days required between unit enlistments.';
  }
  if (lower.contains('army is full')) {
    return 'This military regiment has reached its maximum enlisted capacity.';
  }
  if (lower.contains('recruitment closed')) {
    return 'Recruitment for this military unit is currently closed.';
  }
  if (lower.contains('only accepts its own nationality')) {
    return 'This military unit only accepts citizens of its home nation.';
  }
  if (lower.contains('assign leadership to another member')) {
    return 'You must transfer command to another officer before stepping down.';
  }
  if (lower.contains('leave your current party first') || lower.contains('leave current party')) {
    return 'You must resign from your current political party first.';
  }
  if (lower.contains('already in party')) {
    return 'You are already a member of this political party.';
  }
  if (lower.contains('party members only')) {
    return 'This action is restricted to registered members of this political party.';
  }
  if (lower.contains('already voted') || lower.contains('already cast')) {
    return 'You have already cast your ballot in this election.';
  }
  if (lower.contains('voting is not open') || lower.contains('voting closed')) {
    return 'Voting is currently closed for this election.';
  }
  if (lower.contains('candidature window closed') || lower.contains('candidacy closed')) {
    return 'The candidacy filing window for this election is closed.';
  }
  if (lower.contains('home country only')) {
    return 'This political procedure is reserved for domestic citizens.';
  }
  if (lower.contains('cannot buy your own offer')) {
    return 'You cannot purchase from your own market listing.';
  }
  if (lower.contains('unequip before listing')) {
    return 'Unequip this tactical item before placing it on the market.';
  }
  if (lower.contains('not enough gold') || lower.contains('insufficient gold')) {
    return 'Insufficient Gold reserves in your tactical treasury.';
  }
  if (lower.contains('not enough health') || lower.contains('not enough energy')) {
    return 'Insufficient health points to complete this operation.';
  }
  if (lower.contains('already worked today')) {
    return "Work shift already completed for today's operational cycle.";
  }
  if (lower.contains('already trained today')) {
    return 'Combat training regimen already completed for today.';
  }
  if (lower.contains('cannot switch jobs') ||
      lower.contains('already hired today') ||
      lower.contains('switch jobs on the same day')) {
    return 'You were hired today. You cannot switch jobs or resign until tomorrow.';
  }
  if (lower.contains('already employed at this company') || lower.contains('already work at this company')) {
    return 'You are already employed at this company.';
  }
  if (lower.contains('cannot quit') && (lower.contains('hired') || lower.contains('same day'))) {
    return 'You cannot resign on the same day you were hired. You can resign tomorrow.';
  }
  if (lower.contains('company not found')) {
    return 'Enterprise or company record could not be found.';
  }
  if (lower.contains('offer not available')) {
    return 'This market offer is no longer available.';
  }
  if (lower.contains('not enough raw materials')) {
    return 'Insufficient raw materials in warehouse stock.';
  }
  if (lower.contains('ingredients must share the same quality')) {
    return 'All merge components must have the exact same quality level.';
  }
  if (lower.contains('exactly 3 attachments required')) {
    return 'Merge requires exactly 3 attachments of identical quality.';
  }
  if (lower.contains('q5 is the maximum')) {
    return 'Q5 is already at maximum upgrade capacity.';
  }
  if (lower.contains('downgrade allowed for q2')) {
    return 'Only Q2 through Q5 attachments can be disassembled.';
  }
  if (lower.contains('all ingredients must be owned')) {
    return 'All components must belong to your inventory.';
  }

  // Capitalize first letter and ensure ending period
  String formatted = trimmed;
  if (!formatted.startsWith('•') && formatted.isNotEmpty) {
    formatted = formatted[0].toUpperCase() + formatted.substring(1);
  }
  if (!formatted.endsWith('.') && !formatted.endsWith('!') && !formatted.endsWith('?')) {
    formatted = '$formatted.';
  }
  return formatted;
}

class TacticalErrorCard extends StatelessWidget {
  final dynamic error;
  final VoidCallback? onRetry;
  final EdgeInsetsGeometry padding;

  const TacticalErrorCard({
    super.key,
    required this.error,
    this.onRetry,
    this.padding = const EdgeInsets.all(14),
  });

  @override
  Widget build(BuildContext context) {
    final clean = cleanErrorMessage(error);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.crimson.withOpacity(0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.error_outline_rounded, color: AppColors.crimson, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              clean,
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, height: 1.35),
            ),
          ),
          if (onRetry != null) ...[
            const SizedBox(width: 8),
            TextButton(
              onPressed: onRetry,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.cyan,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              ),
              child: const Text('RETRY', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
            ),
          ],
        ],
      ),
    );
  }
}

/// Displays a sleek, tactical centered modal popup dialog.
/// Perfect for combat errors, validation alerts, and status notifications.
Future<T?> showTacticalPopup<T>({
  required BuildContext context,
  required String message,
  String? title,
  PopupType type = PopupType.error,
  String buttonText = 'ACKNOWLEDGE',
  VoidCallback? onConfirm,
  bool barrierDismissible = true,
}) {
  HapticFeedback.mediumImpact();

  Color accentColor;
  IconData icon;
  String defaultTitle;

  switch (type) {
    case PopupType.error:
      accentColor = AppColors.crimson;
      icon = Icons.error_outline_rounded;
      defaultTitle = 'TACTICAL ALERT';
      break;
    case PopupType.warning:
      accentColor = AppColors.amber;
      icon = Icons.warning_amber_rounded;
      defaultTitle = 'OPERATION WARNING';
      break;
    case PopupType.success:
      accentColor = AppColors.emerald;
      icon = Icons.check_circle_outline_rounded;
      defaultTitle = 'COMMAND CONFIRMED';
      break;
    case PopupType.info:
      accentColor = AppColors.cyan;
      icon = Icons.info_outline_rounded;
      defaultTitle = 'INTELLIGENCE BRIEF';
      break;
  }

  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: barrierDismissible,
    barrierLabel: 'TacticalPopup',
    barrierColor: const Color(0xB3000000), // 70% dark scrim
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (ctx, anim1, anim2) => const SizedBox.shrink(),
    transitionBuilder: (ctx, anim, secondaryAnim, child) {
      final curved = Curves.easeOutBack.transform(anim.value);
      return Transform.scale(
        scale: 0.85 + (0.15 * curved),
        child: Opacity(
          opacity: anim.value.clamp(0.0, 1.0),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 5 * anim.value, sigmaY: 5 * anim.value),
            child: Dialog(
              backgroundColor: Colors.transparent,
              elevation: 0,
              insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
              child: _TacticalPopupCard(
                title: title ?? defaultTitle,
                message: cleanErrorMessage(message),
                accentColor: accentColor,
                icon: icon,
                buttonText: buttonText,
                onConfirm: onConfirm,
              ),
            ),
          ),
        ),
      );
    },
  );
}

/// Helper specifically designed for reporting errors as high-priority popups.
Future<void> showErrorPopup(
  BuildContext context,
  dynamic error, {
  String? title,
  String buttonText = 'ACKNOWLEDGE',
  VoidCallback? onConfirm,
}) {
  final message = cleanErrorMessage(error);
  return showTacticalPopup(
    context: context,
    message: message,
    title: title,
    type: PopupType.error,
    buttonText: buttonText,
    onConfirm: onConfirm,
  );
}

/// Helper for tactical success/confirmation popups.
Future<void> showSuccessPopup(
  BuildContext context,
  String message, {
  String? title,
  String buttonText = 'CONTINUE',
  VoidCallback? onConfirm,
}) {
  return showTacticalPopup(
    context: context,
    message: message,
    title: title,
    type: PopupType.success,
    buttonText: buttonText,
    onConfirm: onConfirm,
  );
}

class _TacticalPopupCard extends StatelessWidget {
  final String title;
  final String message;
  final Color accentColor;
  final IconData icon;
  final String buttonText;
  final VoidCallback? onConfirm;

  const _TacticalPopupCard({
    required this.title,
    required this.message,
    required this.accentColor,
    required this.icon,
    required this.buttonText,
    this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 360),
      decoration: BoxDecoration(
        color: AppColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accentColor.withOpacity(0.55),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: accentColor.withOpacity(0.2),
            blurRadius: 28,
            spreadRadius: 2,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: Colors.black.withOpacity(0.6),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Tactical Icon Badge
          Container(
            width: 58,
            height: 58,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: accentColor.withOpacity(0.12),
              border: Border.all(
                color: accentColor.withOpacity(0.45),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: accentColor.withOpacity(0.15),
                  blurRadius: 12,
                  spreadRadius: 1,
                ),
              ],
            ),
            child: Icon(
              icon,
              color: accentColor,
              size: 30,
            ),
          ),
          const SizedBox(height: 16),

          // Title
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: AppColors.textPrimary,
              fontSize: 15,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 10),

          // Message
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Text(
              message,
              style: const TextStyle(
                color: AppColors.textSecondary,
                fontSize: 13.5,
                height: 1.45,
                fontWeight: FontWeight.w400,
              ),
              textAlign: TextAlign.center,
            ),
          ),
          const SizedBox(height: 22),

          // Acknowledge Action Button
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                HapticFeedback.lightImpact();
                Navigator.of(context, rootNavigator: true).pop();
                onConfirm?.call();
              },
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: accentColor.withOpacity(0.8),
                    width: 1.2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: accentColor.withOpacity(0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.check, size: 16, color: accentColor),
                    const SizedBox(width: 8),
                    Text(
                      buttonText,
                      style: TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
