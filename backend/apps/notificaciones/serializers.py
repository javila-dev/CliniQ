from rest_framework import serializers


class EmailSendSerializer(serializers.Serializer):
    to = serializers.ListField(
        child=serializers.EmailField(),
        allow_empty=False,
    )
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()
    html_body = serializers.CharField(required=False, allow_blank=True)
    from_email = serializers.EmailField(required=False, allow_blank=False)
    cc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )
    bcc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )
    reply_to = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        allow_empty=True,
    )


class EmailConfigSerializer(serializers.Serializer):
    provider = serializers.CharField()
    backend = serializers.CharField()
    host = serializers.CharField()
    port = serializers.IntegerField()
    username = serializers.CharField()
    use_tls = serializers.BooleanField()
    use_ssl = serializers.BooleanField()
    timeout = serializers.IntegerField()
    default_from_email = serializers.EmailField()
    configured = serializers.BooleanField()
