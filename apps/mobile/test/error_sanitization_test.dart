import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nationforge_mobile/core/widgets/tactical_popup.dart';

void main() {
  group('Error Sanitization and Mapping Tests', () {
    test('sanitizes null and empty errors', () {
      expect(cleanErrorMessage(null), 'An unexpected operational event occurred.');
      expect(cleanErrorMessage(''), 'An unexpected operational event occurred.');
    });

    test('strips Exception: and Error: prefixes', () {
      expect(cleanErrorMessage('Exception: portal name too short'), 'Publication name must be at least 3 characters.');
      expect(cleanErrorMessage('Error: already subscribed'), 'You are already subscribed to this publication.');
    });

    test('does not leak Prisma or PostgreSQL internal stack traces', () {
      const leakedPrisma = 'PrismaClientKnownRequestError: \nInvalid `prisma.portalSubscription.create()`\nUnique constraint failed on the fields: (`portalId`,`citizenId`)\n   at Object.check';
      final cleaned = cleanErrorMessage(leakedPrisma);
      expect(cleaned.contains('PrismaClient'), isFalse);
      expect(cleaned.contains('Invalid `prisma'), isFalse);
      expect(cleaned.contains('Object.check'), isFalse);
      expect(cleaned, 'This tactical action has already been completed or the record exists.');
    });

    test('does not leak internal server error (500)', () {
      final dio500 = DioException(
        requestOptions: RequestOptions(path: '/media/portals'),
        response: Response(
          requestOptions: RequestOptions(path: '/media/portals'),
          statusCode: 500,
          data: {'statusCode': 500, 'message': 'Internal server error'},
        ),
      );
      final cleaned = cleanErrorMessage(dio500);
      expect(cleaned.contains('500'), isFalse);
      expect(cleaned.contains('Internal server error'), isFalse);
      expect(cleaned, 'Tactical headquarters servers are temporarily experiencing high load. Please try again shortly.');
    });

    test('maps domain phrases accurately from DioException response data', () {
      final dioAlreadySubscribed = DioException(
        requestOptions: RequestOptions(path: '/media/portals/1/subscribe'),
        response: Response(
          requestOptions: RequestOptions(path: '/media/portals/1/subscribe'),
          statusCode: 409,
          data: {'statusCode': 409, 'message': 'already subscribed'},
        ),
      );
      expect(cleanErrorMessage(dioAlreadySubscribed), 'You are already subscribed to this publication.');

      final dioAlreadyVoted = DioException(
        requestOptions: RequestOptions(path: '/politics/elections/1/vote'),
        response: Response(
          requestOptions: RequestOptions(path: '/politics/elections/1/vote'),
          statusCode: 409,
          data: {'statusCode': 409, 'message': 'already voted'},
        ),
      );
      expect(cleanErrorMessage(dioAlreadyVoted), 'You have already cast your ballot in this election.');

      final dioLeaveArmy = DioException(
        requestOptions: RequestOptions(path: '/mu/1/join'),
        response: Response(
          requestOptions: RequestOptions(path: '/mu/1/join'),
          statusCode: 409,
          data: {'statusCode': 409, 'message': 'leave your current army first'},
        ),
      );
      expect(cleanErrorMessage(dioLeaveArmy), 'You must resign from your current military unit first.');

      final dioCannotSwitchJobs = DioException(
        requestOptions: RequestOptions(path: '/companies/jobs/1/apply'),
        response: Response(
          requestOptions: RequestOptions(path: '/companies/jobs/1/apply'),
          statusCode: 409,
          data: {'statusCode': 409, 'message': 'You were already hired today. You cannot switch jobs on the same day.'},
        ),
      );
      expect(cleanErrorMessage(dioCannotSwitchJobs), 'You were hired today. You cannot switch jobs or resign until tomorrow.');

      final dioCannotQuitJob = DioException(
        requestOptions: RequestOptions(path: '/companies/jobs/quit'),
        response: Response(
          requestOptions: RequestOptions(path: '/companies/jobs/quit'),
          statusCode: 409,
          data: {'statusCode': 409, 'message': 'You cannot quit your job on the same day you were hired.'},
        ),
      );
      expect(cleanErrorMessage(dioCannotQuitJob), 'You cannot resign on the same day you were hired. You can resign tomorrow.');
    });

    test('handles list of validation errors gracefully', () {
      final dioValidation = DioException(
        requestOptions: RequestOptions(path: '/media/portal'),
        response: Response(
          requestOptions: RequestOptions(path: '/media/portal'),
          statusCode: 400,
          data: {
            'statusCode': 400,
            'message': ['name must be at least 3 characters', 'avatarColor must be a valid hex color'],
          },
        ),
      );
      final cleaned = cleanErrorMessage(dioValidation);
      expect(cleaned, '• name must be at least 3 characters\n• avatarColor must be a valid hex color');
    });

    test('handles network and connection errors without leaking sockets', () {
      final dioNetError = DioException(
        requestOptions: RequestOptions(path: '/api'),
        type: DioExceptionType.connectionError,
        message: 'The connection errored: The connection to http://localhost:3001 was refused.',
      );
      expect(cleanErrorMessage(dioNetError), 'Tactical uplink offline. Verify internet connection.');
    });
  });
}
